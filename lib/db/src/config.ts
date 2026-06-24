const isProduction = (process.env["NODE_ENV"] ?? "development") === "production";

function resolveDbUrl(): string {
  if (isProduction) {
    // Production: SUPABASE_PG_URL_PROD → SUPABASE_PG_URL → DATABASE_URL
    return (
      process.env["SUPABASE_PG_URL_PROD"] ??
      process.env["SUPABASE_PG_URL"] ??
      process.env["DATABASE_URL"] ??
      (() => { throw new Error("SUPABASE_PG_URL_PROD harus diset di production"); })()
    );
  }
  // Development: SUPABASE_PG_URL_DEV → SUPABASE_PG_URL_PROD → DATABASE_URL
  // Jika hanya SUPABASE_PG_URL_PROD yang diset (tidak ada versi _DEV), dev juga pakai PROD Supabase
  // sehingga data antara dev dan production konsisten.
  return (
    process.env["SUPABASE_PG_URL_DEV"] ??
    process.env["SUPABASE_PG_URL_PROD"] ??
    process.env["DATABASE_URL"] ??
    (() => { throw new Error("SUPABASE_PG_URL_PROD atau DATABASE_URL harus diset"); })()
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
