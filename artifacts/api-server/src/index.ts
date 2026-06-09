import app from "./app";
import { config } from "./lib/config";
import { logger } from "./lib/logger";

async function start() {
  try {
    const { runMigrations } = await import("@workspace/db");
    await runMigrations();
  } catch (err) {
    logger.warn({ err }, "[migrate] Schema sync gagal — server tetap jalan");
  }

  app.listen(config.port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port: config.port }, "Server listening");
  });
}

start();
