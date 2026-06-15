
interface PgParams {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

/**
 * Parse connection string ke parameter individu agar password
 * dengan karakter khusus (@ # %) tidak merusak URL parser pg.
 */
function parseDbUrl(rawUrl: string): PgParams {
  const cleaned = rawUrl
    .replace(/^postgresql:\/\//, "https://")
    .replace(/^postgres:\/\//, "https://");

  const u = new URL(cleaned);
  return {
    host: u.hostname,
    port: u.port ? parseInt(u.port, 10) : 5432,
    database: u.pathname.replace(/^\//, "") || "postgres",
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
  };
}

const rawUrl =
  process.env["SUPABASE_DATABASE_URL"] ??
  process.env["SUPABASE_PG_URL"] ??
  process.env["DATABASE_URL"] ??
  (() => {
    throw new Error("DATABASE_URL atau SUPABASE_DATABASE_URL harus diset");
  })();

const isSupabase =
  rawUrl.includes("supabase") ||
  rawUrl.includes("pooler") ||
  rawUrl.includes("nzdweipz");

export const dbConfig = {
  url: rawUrl,
  parsed: parseDbUrl(rawUrl),
  ssl: isSupabase ? ({ rejectUnauthorized: false } as const) : (false as const),
} as const;
