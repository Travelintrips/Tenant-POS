import type { Server } from "node:http";
import app from "./app";
import { config } from "./lib/config";
import { logger } from "./lib/logger";
import { startOverdueScheduler } from "./lib/overdue-scheduler";
import { startSheetSyncScheduler } from "./lib/sheet-sync-scheduler";
import { dbConfig } from "@workspace/db";

let httpServer: Server | null = null;
let startupStarted = false;
let shutdownStarted = false;

function validateProductionEnv(): void {
  const isProduction = process.env["NODE_ENV"] === "production";
  if (!isProduction) return;

  const errors: string[] = [];
  const warnings: string[] = [];

  // lib/db/src/config.ts memilih connection string yang cocok dengan SUPABASE_URL,
  // lalu memprioritaskan transaction pooler Supabase (port 6543) bila tersedia.
  // Ini mencegah session-pool exhaustion (EMAXCONNSESSION).
  const pgUrlProd = process.env["SUPABASE_PG_URL_PROD"];
  const pgUrl = process.env["SUPABASE_PG_URL"];
  const poolerUrl = process.env["SUPABASE_POOLER_URL"];
  const databaseUrl = process.env["DATABASE_URL"];

  if (!pgUrlProd && !pgUrl && !poolerUrl && !databaseUrl) {
    errors.push(
      "Tidak ada DB URL yang tersedia (SUPABASE_PG_URL_PROD, SUPABASE_PG_URL, SUPABASE_POOLER_URL, maupun DATABASE_URL tidak diset). " +
      "Server tidak dapat terhubung ke database."
    );
  } else if (!pgUrlProd && !pgUrl && !poolerUrl && databaseUrl) {
    // Hanya DATABASE_URL yang tersedia — ini kemungkinan Replit managed PostgreSQL (dev/lokal),
    // BUKAN database production Supabase. Invoice dan token pembayaran yang dibuat di Supabase
    // tidak akan ditemukan, menyebabkan error "Link pembayaran tidak valid" di halaman /bayar/:token.
    warnings.push(
      "SUPABASE_PG_URL_PROD dan SUPABASE_PG_URL tidak diset. Production menggunakan DATABASE_URL " +
      "sebagai fallback — pastikan ini adalah database production yang benar (bukan DB lokal/dev Replit). " +
      "Jika token pembayaran tidak ditemukan, set SUPABASE_PG_URL_PROD ke connection string Supabase production."
    );
  } else if (pgUrl) {
    warnings.push(
      pgUrlProd
        ? "SUPABASE_PG_URL dipakai sebagai koneksi utama production; SUPABASE_PG_URL_PROD hanya fallback."
        : "Production menggunakan SUPABASE_PG_URL sebagai koneksi utama."
    );
    if (pgUrl.trimEnd() !== pgUrl) {
      warnings.push("SUPABASE_PG_URL memiliki trailing whitespace — akan di-trim sebelum dipakai.");
    }
  } else if (poolerUrl) {
    warnings.push(
      "SUPABASE_PG_URL tidak diset; production menggunakan SUPABASE_POOLER_URL sebagai fallback."
    );
  } else if (pgUrlProd) {
    warnings.push(
      "SUPABASE_PG_URL tidak diset; production terpaksa memakai SUPABASE_PG_URL_PROD. " +
      "Pastikan password-nya masih valid."
    );
  }

  logger.info(
    `[startup] Database connection selected: source=${dbConfig.source}, mode=${dbConfig.poolMode}, project=${dbConfig.projectRef ?? "unknown"}`
  );

  if (dbConfig.poolMode === "session") {
    warnings.push(
      "Koneksi database masih memakai Supabase session pooler. " +
      "Set connection string transaction pooler port 6543 di SUPABASE_POOLER_URL atau SUPABASE_PG_URL " +
      "agar koneksi web tidak kembali mencapai batas EMAXCONNSESSION."
    );
  }

  if (!process.env["SESSION_SECRET"] || process.env["SESSION_SECRET"] === "fallback-dev-secret") {
    errors.push("SESSION_SECRET harus diset ke nilai aman di production.");
  }

  if (process.env["ENABLE_DEV_LOGIN"] === "true") {
    warnings.push(
      "ENABLE_DEV_LOGIN=true aktif di production. " +
      "Dev-login membypass autentikasi normal — hapus atau set ke 'false' kecuali untuk testing sementara yang terkontrol."
    );
  }

  for (const w of warnings) {
    logger.warn(`[startup] ⚠️  ${w}`);
  }

  if (errors.length > 0) {
    for (const e of errors) {
      logger.error(`[startup] ❌ ${e}`);
    }
    logger.error(
      "[startup] Server TIDAK dijalankan karena konfigurasi production tidak lengkap. " +
      "Perbaiki environment variables di atas dan coba lagi."
    );
    throw new Error("Production environment validation failed");
  }

  logger.info("[startup] ✅ Validasi environment production berhasil.");
}

export async function runMigrationsAndScheduler(): Promise<void> {
  const shouldRunMigrations =
    process.env["NODE_ENV"] !== "production" ||
    process.env["RUN_DB_MIGRATIONS_ON_STARTUP"] === "true";

  if (shouldRunMigrations) {
    try {
      const { runMigrations, runUsersIdTextMigration } = await import("@workspace/db");
      await runUsersIdTextMigration();
      await runMigrations();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const cause = err instanceof Error ? (err as Error & { cause?: unknown }).cause : undefined;
      logger.warn(
        { message, cause: cause instanceof Error ? cause.message : cause },
        "[migrate] Schema sync gagal — server tetap jalan",
      );
    }
  } else {
    logger.info(
      "[migrate] Startup migration production dilewati; set RUN_DB_MIGRATIONS_ON_STARTUP=true hanya saat migration memang perlu dijalankan.",
    );
  }

  startOverdueScheduler();
  startSheetSyncScheduler();
}

function getListenPort(): number {
  const rawPort = process.env["PORT"] ?? String(config.port);
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid PORT value: ${rawPort}`);
  }
  return port;
}

function shutdown(reason: string, exitCode = 0): void {
  if (shutdownStarted) return;
  shutdownStarted = true;
  process.exitCode = exitCode;

  const server = httpServer;
  if (!server) {
    process.exit(exitCode);
    return;
  }

  logger.info({ reason }, "[shutdown] Menutup HTTP server...");
  const forceExitTimer = setTimeout(() => {
    logger.warn("[shutdown] HTTP server belum tertutup, memutus koneksi dan keluar paksa");
    server.closeAllConnections();
    process.exit(exitCode);
  }, 10_000);
  forceExitTimer.unref();

  server.close((err) => {
    clearTimeout(forceExitTimer);
    httpServer = null;
    if (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err, message }, "[shutdown] Gagal menutup HTTP server");
    } else {
      logger.info("[shutdown] HTTP server tertutup");
    }
    process.exit(exitCode);
  });
}

export function start(): void {
  if (startupStarted) {
    logger.warn("[startup] Start sudah dipanggil, inisialisasi kedua dilewati");
    return;
  }
  startupStarted = true;

  let port: number;
  try {
    port = getListenPort();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, message }, "[startup] PORT tidak valid");
    process.exit(1);
    return;
  }

  // Bind listener terlebih dahulu. Jangan menunggu database, migration, atau
  // scheduler sebelum Hostinger menerima health check.
  try {
    httpServer = app.listen(port, "0.0.0.0");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, message, port }, `[startup] Error listening on port ${port}`);
    process.exit(1);
    return;
  }

  const server = httpServer;
  server.once("error", (err) => {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, message, port }, `[startup] Error listening on port ${port}`);
    httpServer = null;
    process.exit(1);
  });

  server.once("listening", () => {
    logger.info(`Server listening on PORT ${port}`);

    try {
      validateProductionEnv();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err, message }, "[startup] Validasi environment gagal");
      shutdown("startup validation failed", 1);
      return;
    }

    // Semua pekerjaan startup yang berpotensi menunggu dilakukan setelah
    // listener siap menerima request.
    void runMigrationsAndScheduler().catch((err) => {
      logger.error({ err }, "Migration/scheduler error");
    });
  });
}

// Safety net: cegah Worker thread (tesseract.js, pdf-parse) crash seluruh process
process.on("unhandledRejection", (reason) => {
  logger.warn({ reason }, "[process] unhandledRejection ditangkap — diabaikan agar server tidak crash");
});
process.on("uncaughtException", (err) => {
  if ((err as NodeJS.ErrnoException).code === "ERR_WORKER_UNHANDLED_ERROR") {
    logger.warn({ err: err.message }, "[process] Worker error diabaikan");
    return;
  }
  logger.error({ err }, "[process] uncaughtException — server tetap jalan");
});

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));

if (process.env["NODE_ENV"] !== "test") {
  start();
}
