const rawUrl =
  process.env["DATABASE_URL"] ??
  process.env["SUPABASE_DATABASE_URL_DEV"] ??
  process.env["SUPABASE_PG_URL"] ??
  (() => { throw new Error("DATABASE_URL harus diset"); })();

const isSupabase = rawUrl.includes("supabase") || rawUrl.includes("pooler");

export const dbConfig = {
  url: rawUrl,
  ssl: isSupabase ? { rejectUnauthorized: false } : false,
  env: (process.env["NODE_ENV"] ?? "development") === "development" ? "development" : "production",
} as const;
