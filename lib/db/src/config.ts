const isProduction = (process.env["NODE_ENV"] ?? "development") === "production";

function resolveDbUrl(): string {
  // Development dan production memakai project Supabase yang berbeda. Jangan
  // memakai kredensial production saat workflow development berjalan karena
  // keduanya bisa memiliki password atau project yang berbeda.
  const url = isProduction
    ? process.env["SUPABASE_PG_URL_PROD"] ??
      process.env["SUPABASE_PG_URL"] ??
      process.env["SUPABASE_POOLER_URL"] ??
      process.env["DATABASE_URL"]
    : process.env["SUPABASE_PG_URL_DEV"] ??
      process.env["SUPABASE_PG_URL_PROD"] ??
      process.env["SUPABASE_POOLER_URL"] ??
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
      }
    : { connectionString: rawUrl },
  ssl: isSupabase ? ({ rejectUnauthorized: false } as const) : (false as const),
  env: isProduction ? "production" : "development",
} as const;
