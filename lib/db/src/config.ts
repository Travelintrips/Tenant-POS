interface PgParams {
  user?: string;
  password?: string;
  host?: string;
  port?: number;
  database?: string;
  connectionString?: string;
}

function parseDbUrl(url: string): PgParams {
  try {
    const protoEnd = url.indexOf("://") + 3;
    const lastAt = url.lastIndexOf("@");
    if (lastAt < protoEnd) return { connectionString: url };
    const userinfo = url.substring(protoEnd, lastAt);
    const rest = url.substring(lastAt + 1);
    const colonIdx = userinfo.indexOf(":");
    if (colonIdx < 0) return { connectionString: url };
    const user = userinfo.substring(0, colonIdx);
    const password = decodeURIComponent(userinfo.substring(colonIdx + 1));
    const qIdx = rest.indexOf("?");
    const restNoQuery = qIdx >= 0 ? rest.substring(0, qIdx) : rest;
    const slashIdx = restNoQuery.indexOf("/");
    const hostport = slashIdx >= 0 ? restNoQuery.substring(0, slashIdx) : restNoQuery;
    const database = slashIdx >= 0 ? restNoQuery.substring(slashIdx + 1) : "postgres";
    const portColon = hostport.lastIndexOf(":");
    const host = portColon >= 0 ? hostport.substring(0, portColon) : hostport;
    const port = portColon >= 0 ? Number(hostport.substring(portColon + 1)) : 5432;
    return { user, password, host, port, database };
  } catch {
    return { connectionString: url };
  }
}

const isProduction = (process.env["NODE_ENV"] ?? "development") === "production";

// Prioritas koneksi: DATABASE_URL (local Replit postgres) > SUPABASE_PG_URL > error
// DATABASE_URL diprioritaskan karena koneksi Supabase pooler memerlukan kredensial aktif
const rawUrl = isProduction
  ? (process.env["SUPABASE_PG_URL_PROD"] ??
     process.env["SUPABASE_PG_URL"] ??
     process.env["DATABASE_URL"] ??
     (() => { throw new Error("SUPABASE_PG_URL_PROD harus diset di production"); })())
  : (process.env["DATABASE_URL"] ??
     process.env["SUPABASE_PG_URL"] ??
     (() => { throw new Error("DATABASE_URL atau SUPABASE_PG_URL harus diset di development"); })());

const isSupabase =
  rawUrl.includes("supabase") ||
  rawUrl.includes("pooler");

export const dbConfig = {
  url: rawUrl,
  parsed: parseDbUrl(rawUrl),
  ssl: isSupabase ? ({ rejectUnauthorized: false } as const) : (false as const),
  env: isProduction ? "production" : "development",
} as const;
