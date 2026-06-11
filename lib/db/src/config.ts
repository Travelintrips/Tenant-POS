
const isDev = (process.env["NODE_ENV"] ?? "development") === "development";

const rawUrl = isDev
  ? (
    process.env["SUPABASE_DATABASE_URL_DEV"] ??
    process.env["SUPABASE_PG_URL"] ??
    process.env["DATABASE_URL"] ??
    (() => { throw new Error("SUPABASE_DATABASE_URL_DEV atau SUPABASE_PG_URL harus diset"); })()
  )
  : (
    process.env["SUPABASE_PG_URL"] ??
    process.env["DATABASE_URL"] ??
    (() => { throw new Error("SUPABASE_PG_URL harus diset di production"); })()
  );
const rawUrl =
  process.env["SUPABASE_DATABASE_URL"] ??
  process.env["SUPABASE_PG_URL"] ??
  process.env["DATABASE_URL"] ??
  (() => {
    throw new Error("SUPABASE_PG_URL atau DATABASE_URL harus diset");
  })();

const isSupabase = rawUrl.includes("supabase") || rawUrl.includes("pooler");

export const dbConfig = {
  url: rawUrl,
  ssl: isSupabase ? { rejectUnauthorized: false } : false,
  env: isDev ? "development" : "production",
} as const;
