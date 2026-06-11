const isDev = (process.env["NODE_ENV"] ?? "development") === "development";

const rawUrl =
  process.env["DATABASE_URL"] ??
  process.env["SUPABASE_DATABASE_URL"] ??
  process.env["SUPABASE_PG_URL"] ??
  (() => {
    throw new Error("DATABASE_URL atau SUPABASE_PG_URL harus diset");
  })();

const isSupabase = rawUrl.includes("supabase") || rawUrl.includes("pooler");

export const dbConfig = {
  url: rawUrl,
  ssl: isSupabase ? { rejectUnauthorized: false } : false,
  env: isDev ? "development" : "production",
} as const;
