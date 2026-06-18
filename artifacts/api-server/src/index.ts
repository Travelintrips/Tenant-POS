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

  const pgUrlProd = process.env["SUPABASE_PG_URL_PROD"];
  const pgUrlFallback = process.env["SUPABASE_PG_URL"];

  if (!pgUrlProd) {
    errors.push(
      "SUPABASE_PG_URL_PROD tidak diset di production. " +
      "Server menolak start untuk mencegah koneksi ke database development."
    );
  } else {
    const devProjectId = "xssrfshdrtdfupgqwfdw";
    if (pgUrlProd.includes(devProjectId)) {
      errors.push(
        `SUPABASE_PG_URL_PROD mengandung project ID development (${devProjectId}). ` +
        "Pastikan SUPABASE_PG_URL_PROD mengarah ke database production yang berbeda."
      );
    }
    if (pgUrlProd.trimEnd() !== pgUrlProd) {
      warnings.push("SUPABASE_PG_URL_PROD memiliki trailing whitespace — bisa menyebabkan koneksi gagal.");
    }
  }

  if (pgUrlFallback && pgUrlProd && pgUrlFallback.trim() === pgUrlProd.trim()) {
    warnings.push(
      "SUPABASE_PG_URL_PROD dan SUPABASE_PG_URL memiliki nilai yang sama. " +
      "Pastikan production dan development tidak menggunakan database yang sama."
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
