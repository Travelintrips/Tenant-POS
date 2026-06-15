const isProduction = (process.env["NODE_ENV"] ?? "development") === "production";

const rawUrl = (isProduction
  ? (process.env["SUPABASE_PG_URL_PROD"] ??
     process.env["SUPABASE_PG_URL"] ??
     process.env["SUPABASE_DATABASE_URL"] ??
     process.env["DATABASE_URL"] ??
     (() => { throw new Error("SUPABASE_PG_URL_PROD atau DATABASE_URL harus diset di production"); })())
  : (process.env["SUPABASE_PG_URL"] ??
     process.env["SUPABASE_DATABASE_URL"] ??
     process.env["DATABASE_URL"] ??
     (() => { throw new Error("SUPABASE_PG_URL atau DATABASE_URL harus diset"); })())).trim();

const isSupabase =
  rawUrl.includes("supabase") ||
  rawUrl.includes("pooler");

function parseDbUrl(url: string) {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parseInt(parsed.port || "5432", 10),
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      database: parsed.pathname.replace(/^\//, ""),
    };
  } catch {
    return null;
  }
}

const parsed = isSupabase ? parseDbUrl(rawUrl) : null;

export const dbConfig = {
  url: rawUrl,
  parsed: parsed
    ? {
        host: parsed.host,
        port: parsed.port,
        user: parsed.user,
        password: parsed.password,
        database: parsed.database,
      }
    : { connectionString: rawUrl },
  ssl: isSupabase ? ({ rejectUnauthorized: false } as const) : (false as const),
  env: isProduction ? "production" : "development",
} as const;
