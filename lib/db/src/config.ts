
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
/**
 * Parse connection string ke parameter individu agar password
 * dengan karakter khusus (@ # %) tidak merusak URL parser pg.
 */
function parseDbUrl(rawUrl: string): PgParams {
  try {
    const protoEnd = rawUrl.indexOf("://") + 3;
    const lastAt = rawUrl.lastIndexOf("@");
    if (lastAt < protoEnd) {
      const u = new URL(rawUrl.replace(/^postgresql:\/\//, "https://").replace(/^postgres:\/\//, "https://"));
      return {
        host: u.hostname,
        port: u.port ? parseInt(u.port, 10) : 5432,
        database: u.pathname.replace(/^\//, "") || "postgres",
        user: decodeURIComponent(u.username),
        password: decodeURIComponent(u.password),
      };
    }
    const userinfo = rawUrl.substring(protoEnd, lastAt);
    const rest = rawUrl.substring(lastAt + 1);
    const colonIdx = userinfo.indexOf(":");
    if (colonIdx < 0) throw new Error("No colon in userinfo");
    const user = userinfo.substring(0, colonIdx);
    const password = decodeURIComponent(userinfo.substring(colonIdx + 1));
    const qIdx = rest.indexOf("?");
    const restNoQuery = qIdx >= 0 ? rest.substring(0, qIdx) : rest;
    const slashIdx = restNoQuery.indexOf("/");
    const hostport = slashIdx >= 0 ? restNoQuery.substring(0, slashIdx) : restNoQuery;
    const database = slashIdx >= 0 ? restNoQuery.substring(slashIdx + 1) : "";
    const database = slashIdx >= 0 ? restNoQuery.substring(slashIdx + 1) : "postgres";
    const portColon = hostport.lastIndexOf(":");
    const host = portColon >= 0 ? hostport.substring(0, portColon) : hostport;
    const port = portColon >= 0 ? Number(hostport.substring(portColon + 1)) : 5432;
    return { user, password, host, port, database };
  } catch {
    return { connectionString: url };
    const u = new URL(rawUrl.replace(/^postgresql:\/\//, "https://").replace(/^postgres:\/\//, "https://"));
    return {
      host: u.hostname,
      port: u.port ? parseInt(u.port, 10) : 5432,
      database: u.pathname.replace(/^\//, "") || "postgres",
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
    };
  }
}

const rawUrl =
  process.env["DATABASE_URL"] ??
  process.env["SUPABASE_DATABASE_URL"] ??
  process.env["SUPABASE_PG_URL"] ??
  (() => {
    throw new Error("DATABASE_URL harus diset");
  })();
  process.env["SUPABASE_PG_URL"] ??
  process.env["SUPABASE_DATABASE_URL"] ??
  process.env["DATABASE_URL"] ??
  (() => { throw new Error("SUPABASE_PG_URL atau DATABASE_URL harus diset"); })();

const isSupabase =
  rawUrl.includes("supabase") ||
  rawUrl.includes("pooler") ||
  rawUrl.includes("nzdweipz");

export const dbConfig = {
  url: rawUrl,
  parsed: parseDbUrl(rawUrl),
  ssl: isSupabase ? { rejectUnauthorized: false } : false,
  ssl: isSupabase ? ({ rejectUnauthorized: false } as const) : (false as const),
  env: (process.env["NODE_ENV"] ?? "development") === "development" ? "development" : "production",
} as const;
