import app from "./app";
import { config } from "./lib/config";
import { logger } from "./lib/logger";
import { startOverdueScheduler } from "./lib/overdue-scheduler";
import { startSheetSyncScheduler } from "./lib/sheet-sync-scheduler";

function validateProductionEnv(): void {
  const isProduction = process.env["NODE_ENV"] === "production";
  if (!isProduction) return;

  const errors: string[] = [];
  const warnings: string[] = [];

  // lib/db/src/config.ts pakai prioritas: SUPABASE_PG_URL_PROD → SUPABASE_PG_URL → DATABASE_URL
  // Validasi harus konsisten dengan urutan prioritas itu.
  const pgUrlProd = process.env["SUPABASE_PG_URL_PROD"];
  const pgUrl = process.env["SUPABASE_PG_URL"];
  const databaseUrl = process.env["DATABASE_URL"];

  if (!pgUrlProd && !pgUrl && !databaseUrl) {
    errors.push(
      "Tidak ada DB URL yang tersedia (SUPABASE_PG_URL_PROD, SUPABASE_PG_URL, maupun DATABASE_URL tidak diset). " +
      "Server tidak dapat terhubung ke database."
    );
  } else if (!pgUrlProd && !pgUrl && databaseUrl) {
    // Hanya DATABASE_URL yang tersedia — ini kemungkinan Replit managed PostgreSQL (dev/lokal),
    // BUKAN database production Supabase. Invoice dan token pembayaran yang dibuat di Supabase
    // tidak akan ditemukan, menyebabkan error "Link pembayaran tidak valid" di halaman /bayar/:token.
    warnings.push(
      "SUPABASE_PG_URL_PROD dan SUPABASE_PG_URL tidak diset. Production menggunakan DATABASE_URL " +
      "sebagai fallback — pastikan ini adalah database production yang benar (bukan DB lokal/dev Replit). " +
      "Jika token pembayaran tidak ditemukan, set SUPABASE_PG_URL_PROD ke connection string Supabase production."
    );
  } else if (!pgUrlProd && pgUrl) {
    warnings.push(
      "SUPABASE_PG_URL_PROD tidak diset, menggunakan SUPABASE_PG_URL sebagai fallback. " +
      "Pastikan SUPABASE_PG_URL mengarah ke database production yang benar."
    );
    if (pgUrl.trimEnd() !== pgUrl) {
      warnings.push("SUPABASE_PG_URL memiliki trailing whitespace — bisa menyebabkan koneksi gagal.");
    }
  } else if (pgUrlProd) {
    if (pgUrlProd.trimEnd() !== pgUrlProd) {
      warnings.push("SUPABASE_PG_URL_PROD memiliki trailing whitespace — bisa menyebabkan koneksi gagal.");
    }
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
    process.exit(1);
  }

  logger.info("[startup] ✅ Validasi environment production berhasil.");
}

async function runMigrationsAndScheduler() {
  try {
    const { runMigrations, runUsersIdTextMigration } = await import("@workspace/db");
    await runUsersIdTextMigration();
    await runMigrations();
  } catch (err) {
    logger.warn({ err }, "[migrate] Schema sync gagal — server tetap jalan");
  }

  startOverdueScheduler();
  startSheetSyncScheduler();
}

async function start() {
  validateProductionEnv();

  app.listen(config.port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port: config.port }, "Server listening — running migrations in background");

    runMigrationsAndScheduler().catch((err) => {
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

start();
