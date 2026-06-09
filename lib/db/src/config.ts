const rawUrl =
  process.env["DATABASE_URL"] ??
  process.env["SUPABASE_DATABASE_URL"] ??
  (() => {
    throw new Error("SUPABASE_DATABASE_URL atau DATABASE_URL harus diset");
  })();

const isSupabase = rawUrl.includes("supabase");

export const dbConfig = {
  url: rawUrl,
  ssl: isSupabase ? { rejectUnauthorized: false } : false,
} as const;
