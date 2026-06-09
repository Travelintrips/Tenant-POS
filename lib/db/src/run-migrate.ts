import { runMigrations } from "./migrator.js";

runMigrations()
  .then(() => {
    console.log("[migrate] Selesai");
    process.exit(0);
  })
  .catch((err) => {
    console.error("[migrate] Gagal:", err);
    process.exit(1);
  });
