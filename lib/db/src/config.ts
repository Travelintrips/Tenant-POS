
function decodeDbUrl(url: string): string {
  try {
    const protoEnd = url.indexOf("://") + 3;
    const lastAt = url.lastIndexOf("@");
    if (lastAt < protoEnd) return url;
    const userinfo = url.substring(protoEnd, lastAt);
    const hostpart = url.substring(lastAt + 1);
    const colonIdx = userinfo.indexOf(":");
    if (colonIdx < 0) return url;
    const user = userinfo.substring(0, colonIdx);
    const pw = userinfo.substring(colonIdx + 1);
    return url.substring(0, protoEnd) + user + ":" + decodeURIComponent(pw) + "@" + hostpart;
  } catch {
    return url;
  }
}

const rawUrl = decodeDbUrl(
  process.env["SUPABASE_PG_URL"] ??
const rawUrl =
  process.env["SUPABASE_DATABASE_URL"] ??
  process.env["SUPABASE_PG_URL"] ??
  process.env["DATABASE_URL"] ??
  (() => { throw new Error("DATABASE_URL atau SUPABASE_PG_URL harus diset"); })()
);

const isSupabase = rawUrl.includes("supabase") || rawUrl.includes("pooler");

export const dbConfig = {
  url: rawUrl,
  ssl: isSupabase ? { rejectUnauthorized: false } : false,
} as const;
