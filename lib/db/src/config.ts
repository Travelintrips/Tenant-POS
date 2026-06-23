const isProduction = (process.env["NODE_ENV"] ?? "development") === "production";

function resolveDbUrl(): string {
  if (isProduction) {
    // Production (Cloud Run): pakai SUPABASE_PG_URL_PROD
    return (
      process.env["SUPABASE_PG_URL_PROD"] ??
      process.env["DATABASE_URL"] ??
      (() => { throw new Error("SUPABASE_PG_URL_PROD harus diset di production"); })()
    );
  }
  // Development (Replit): coba SUPABASE_PG_URL_DEV dulu, fallback ke local postgres
  // Jika SUPABASE_PG_URL_DEV password salah/expired, local postgres (DATABASE_URL) akan dipakai
  return (
    process.env["DATABASE_URL"] ??
    process.env["SUPABASE_PG_URL_DEV"] ??
    (() => { throw new Error("DATABASE_URL atau SUPABASE_PG_URL_DEV harus diset"); })()
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
    ? { host: parsedUrl.host, port: parsedUrl.port, user: parsedUrl.user, password: parsedUrl.password, database: parsedUrl.database }
    : { connectionString: rawUrl },
  ssl: isSupabase ? ({ rejectUnauthorized: false } as const) : (false as const),
  env: isProduction ? "production" : "development",
} as const;
