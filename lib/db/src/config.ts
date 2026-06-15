const isProduction = (process.env["NODE_ENV"] ?? "development") === "production";

const rawUrl =
  process.env["DATABASE_URL"] ??
  process.env["SUPABASE_PG_URL_PROD"] ??
  process.env["SUPABASE_PG_URL"] ??
  (() => { throw new Error("DATABASE_URL harus diset"); })();

const isSupabase =
  rawUrl.includes("supabase") ||
  rawUrl.includes("pooler");

export const dbConfig = {
  url: rawUrl,
  parsed: { connectionString: rawUrl },
  ssl: isSupabase ? ({ rejectUnauthorized: false } as const) : (false as const),
  env: isProduction ? "production" : "development",
} as const;
