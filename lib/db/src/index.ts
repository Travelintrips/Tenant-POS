import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { dbConfig } from "./config";

const { Pool } = pg;

function positiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

// Supabase session pooler membatasi backend session secara ketat. Gunakan pool
// aplikasi kecil jika transaction pooler (6543) tidak tersedia, sehingga satu
// instance Tenant-POS tidak dapat menghabiskan seluruh slot koneksi project.
export const dbPoolMax = positiveIntEnv(
  "DB_POOL_MAX",
  dbConfig.poolMode === "transaction" ? 6 : 3,
);

export const pool = new Pool({
  ...dbConfig.parsed,
  ssl: dbConfig.ssl,
  max: dbPoolMax,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 8_000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
  application_name: "tenant-pos-api",
});

// PgBouncer transaction mode (port 6543) bisa menghapus search_path session.
// Pastikan setiap koneksi baru selalu set search_path=public agar
// query Drizzle tanpa schema prefix (mis. SELECT FROM "users") tidak gagal.
pool.on("connect", (client) => {
  client.query("SET search_path TO public").catch(() => {});
});

export const db = drizzle(pool, { schema });

export * from "./schema";
export {
  BANK_COA_RULE_SEED_SQL,
  runMigrations,
  runUsersIdTextMigration,
} from "./migrator";
export { dbConfig } from "./config";
