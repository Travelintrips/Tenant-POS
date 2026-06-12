import app from "./app";
import { config } from "./lib/config";
import { logger } from "./lib/logger";
import { startOverdueScheduler } from "./lib/overdue-scheduler";

async function runMigrationsAndScheduler() {
  try {
    const { runMigrations, runUsersIdTextMigration } = await import("@workspace/db");
    await runUsersIdTextMigration();
    await runMigrations();
  } catch (err) {
    logger.warn({ err }, "[migrate] Schema sync gagal — server tetap jalan");
  }

  startOverdueScheduler();
}

async function start() {
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

start();
