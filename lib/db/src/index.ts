import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const connectionString =
  process.env.SUPABASE_PG_URL ||
  process.env.SUPABASE_DATABASE_URL_DEV ||
  process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("SUPABASE_PG_URL, SUPABASE_DATABASE_URL_DEV, or DATABASE_URL must be set. Did you forget to provision a database?");
}

export const pool = new Pool({
  connectionString,
  ssl: connectionString?.includes("supabase") ? { rejectUnauthorized: false } : undefined,
});
export const db = drizzle(pool, { schema });

export * from "./schema";
export { runMigrations } from "./migrator";
