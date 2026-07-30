const isProduction = (process.env["NODE_ENV"] ?? "development") === "production";

function resolveDbUrl(): string {
  // Prioritas url koneksi database:
  // 1. SUPABASE_POOLER_URL — shared env var, selalu tersedia di semua environment
  // 2. SUPABASE_PG_URL — production env var (hanya tersedia saat deploy)
  // 3. SUPABASE_PG_URL_PROD — secret (fallback jika di atas tidak ada)
  // 4. SUPABASE_PG_URL_DEV — env var development (project dev, schema mungkin berbeda)
  const url =
    process.env["SUPABASE_POOLER_URL"] ??
    process.env["SUPABASE_PG_URL"] ??
    process.env["SUPABASE_PG_URL_PROD"] ??
    process.env["SUPABASE_PG_URL_DEV"] ??
    process.env["DATABASE_URL"];
  if (!url) throw new Error("SUPABASE_POOLER_URL atau SUPABASE_PG_URL_PROD harus diset di Secrets/Config");
  return url;
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
        options: "-c search_path=public",
      }
    : { connectionString: rawUrl },
  ssl: isSupabase ? ({ rejectUnauthorized: false } as const) : (false as const),
  env: isProduction ? "production" : "development",
} as const;
