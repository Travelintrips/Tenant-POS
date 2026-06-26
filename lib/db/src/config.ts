const isProduction = (process.env["NODE_ENV"] ?? "development") === "production";

function resolveDbUrl(): string {
  if (isProduction) {
    // Production: SUPABASE_PG_URL_PROD → SUPABASE_PG_URL → DATABASE_URL
    return (
      process.env["SUPABASE_PG_URL_PROD"] ??
      process.env["SUPABASE_PG_URL"] ??
      process.env["DATABASE_URL"] ??
      (() => { throw new Error("SUPABASE_PG_URL atau DATABASE_URL harus diset di production"); })()
    );
  }
  // Development: SUPABASE_PG_URL_DEV → DATABASE_URL
  // TIDAK menggunakan SUPABASE_PG_URL_PROD agar dev dan prod benar-benar terpisah.
  // Set SUPABASE_PG_URL_DEV di Replit Secrets ke URL Supabase project dev Anda.
  return (
    process.env["SUPABASE_PG_URL_DEV"] ??
    process.env["DATABASE_URL"] ??
    (() => { throw new Error("SUPABASE_PG_URL_DEV atau DATABASE_URL harus diset di development"); })()
  // Development: pakai DB dev terpisah dari prod
  // SUPABASE_PG_URL_DEV → SUPABASE_DATABASE_URL_DEV → DATABASE_URL (Replit internal, last resort)
  return (
    process.env["SUPABASE_PG_URL_DEV"] ??
    process.env["SUPABASE_DATABASE_URL_DEV"] ??
    process.env["DATABASE_URL"] ??
    (() => { throw new Error("SUPABASE_PG_URL_DEV atau SUPABASE_DATABASE_URL_DEV harus diset di development"); })()
  );
}

const rawUrl = resolveDbUrl().trim();

const isSupabase = rawUrl.includes("supabase") || rawUrl.includes("pooler");

function parseDbUrl(url: string) {
  try {
    const u = new URL(url);
    return {
      host: u.hostname,
      port: parseInt(u.port || "5432", 10),
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      database: u.pathname.replace(/^\//, ""),
    };
  } catch {
    return null;
  }
}

const parsedUrl = isSupabase ? parseDbUrl(rawUrl) : null;

export const dbConfig = {
  url: rawUrl,
  parsed: parsedUrl
    ? {
        host: parsedUrl.host,
        port: parsedUrl.port,
        user: parsedUrl.user,
        password: parsedUrl.password,
        database: parsedUrl.database,
        // Supabase Transaction Pooler (port 6543) tidak otomatis set search_path=public
        // Tanpa ini, query seperti `SELECT FROM users` gagal dengan "relation does not exist"
        options: "-c search_path=public",
      }
    : { connectionString: rawUrl },
  ssl: isSupabase ? ({ rejectUnauthorized: false } as const) : (false as const),
  env: isProduction ? "production" : "development",
} as const;
