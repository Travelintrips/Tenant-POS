import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { dbConfig } from "./config";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: dbConfig.url,
  ssl: dbConfig.ssl,
});

export const db = drizzle(pool, { schema });

export * from "./schema";
export { runMigrations } from "./migrator";
export { dbConfig } from "./config";
