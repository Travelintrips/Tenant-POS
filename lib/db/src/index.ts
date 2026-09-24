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
  dbConfig.env === "production" ? 1 : dbConfig.poolMode === "transaction" ? 4 : 2,
);

export const pool = new Pool({
  ...dbConfig.parsed,
  ssl: dbConfig.ssl,
  max: dbPoolMax,
  idleTimeoutMillis: 5_000,
  connectionTimeoutMillis: 8_000,
  query_timeout: 12_000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
  application_name: "tenant-pos-api",
});

// Jangan menjalankan SET/search_path pada transaction pooler. Supavisor transaction
// mode tidak menjamin session state antar transaksi. Schema aplikasi memang public
// secara default, sehingga query Drizzle tetap aman tanpa SET per koneksi.
pool.on("error", (err) => {
  const code = (err as NodeJS.ErrnoException).code ?? "unknown";
  console.error(`[db-pool] idle client error code=${code} message=${err.message}`);
});

export const db = drizzle(pool, { schema });

export * from "./schema";
export {
  BANK_COA_RULE_SEED_SQL,
  runMigrations,
  runUsersIdTextMigration,
} from "./migrator";
export { dbConfig } from "./config";
