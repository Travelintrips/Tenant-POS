const rawUrl =
  process.env["DATABASE_URL"] ??
  process.env["SUPABASE_PG_URL"] ??
  process.env["SUPABASE_DATABASE_URL_DEV"] ??
  (() => {
    throw new Error("DATABASE_URL harus diset");
  })();

const isSupabase = rawUrl.includes("supabase");

export const dbConfig = {
  url: rawUrl,
  ssl: isSupabase ? { rejectUnauthorized: false } : false,
} as const;
