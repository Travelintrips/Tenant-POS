import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { dbConfig } from "./config";

const { Pool } = pg;

export const pool = new Pool({
  ...dbConfig.parsed,
  ssl: dbConfig.ssl,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

// PgBouncer transaction mode (port 6543) bisa menghapus search_path session.
// Pastikan setiap koneksi baru selalu set search_path=public agar
// query Drizzle tanpa schema prefix (mis. SELECT FROM "users") tidak gagal.
pool.on("connect", (client) => {
  client.query("SET search_path TO public").catch(() => {});
});

export const db = drizzle(pool, { schema });

export * from "./schema";
export { runMigrations, runUsersIdTextMigration } from "./migrator";
export { dbConfig } from "./config";
