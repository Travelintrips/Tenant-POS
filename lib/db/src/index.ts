import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { dbConfig } from "./config";

const { Pool } = pg;

export const pool = new Pool({
  ...dbConfig.parsed,
  ssl: dbConfig.ssl,
});

export const db = drizzle(pool, { schema });

export * from "./schema";
export { runMigrations, runUsersIdTextMigration } from "./migrator";
export { dbConfig } from "./config";
