import { readFileSync } from "node:fs";
import { supabaseRootCa } from "./supabase-root-ca";

const isProduction = (process.env["NODE_ENV"] ?? "development") === "production";

type DbPoolMode = "transaction" | "session" | "direct";
type DbUrlSource =
  | "SUPABASE_POOLER_URL"
  | "SUPABASE_PG_URL"
  | "SUPABASE_PG_URL_PROD"
  | "SUPABASE_PG_URL_DEV"
  | "DATABASE_URL";

type DbCandidate = {
  source: DbUrlSource;
  value: string;
};

function getSupabaseProjectRef(): string | null {
  const raw = process.env["SUPABASE_URL"]?.trim();
  if (!raw) return null;

  try {
    const host = new URL(raw).hostname;
    const firstLabel = host.split(".")[0];
    return firstLabel || null;
  } catch {
    return null;
  }
}

function getCandidateProjectRef(url: string): string | null {
  try {
    const parsed = new URL(url);
    const username = decodeURIComponent(parsed.username);

    const usernameMatch = username.match(/^postgres\.([a-z0-9]+)$/i);
    if (usernameMatch?.[1]) return usernameMatch[1];

    const hostMatch = parsed.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/i);
    if (hostMatch?.[1]) return hostMatch[1];

    return null;
  } catch {
    return null;
  }
}

function getPoolMode(url: string): DbPoolMode {
  try {
    const parsed = new URL(url);
    if (parsed.port === "6543") return "transaction";
    if (parsed.hostname.includes("pooler.supabase.com")) return "session";
    return "direct";
  } catch {
    return "direct";
  }
}

function getCandidates(): DbCandidate[] {
  const ordered: Array<[DbUrlSource, string | undefined]> = isProduction
    ? [
        ["SUPABASE_POOLER_URL", process.env["SUPABASE_POOLER_URL"]],
        ["SUPABASE_PG_URL", process.env["SUPABASE_PG_URL"]],
        ["SUPABASE_PG_URL_PROD", process.env["SUPABASE_PG_URL_PROD"]],
        ["DATABASE_URL", process.env["DATABASE_URL"]],
      ]
    : [
        ["SUPABASE_PG_URL_DEV", process.env["SUPABASE_PG_URL_DEV"]],
        ["SUPABASE_POOLER_URL", process.env["SUPABASE_POOLER_URL"]],
        ["DATABASE_URL", process.env["DATABASE_URL"]],
      ];

  return ordered
    .filter((entry): entry is [DbUrlSource, string] => Boolean(entry[1]?.trim()))
    .map(([source, value]) => ({ source, value: value.trim() }));
}

function resolveDbUrl(): {
  url: string;
  source: DbUrlSource;
  poolMode: DbPoolMode;
  projectRef: string | null;
} {
  const candidates = getCandidates();

  if (candidates.length === 0) {
    throw new Error(
      "SUPABASE_POOLER_URL, SUPABASE_PG_URL, SUPABASE_PG_URL_PROD, SUPABASE_PG_URL_DEV, atau DATABASE_URL harus diset di Secrets/Config",
    );
  }

  const expectedProjectRef = getSupabaseProjectRef();

  // Jangan sampai production diam-diam tersambung ke project Supabase yang salah.
  // Jika SUPABASE_URL tersedia, prioritaskan hanya connection string yang project
  // ref-nya sama. Ini mencegah DEV/PROD tertukar saat beberapa secret coexist.
  const matchingProjectCandidates = expectedProjectRef
    ? candidates.filter((candidate) => {
        const ref = getCandidateProjectRef(candidate.value);
        return ref === null || ref === expectedProjectRef;
      })
    : candidates;

  const scopedCandidates =
    matchingProjectCandidates.length > 0 ? matchingProjectCandidates : candidates;

  // Web/API harus memakai transaction pooler (port 6543) bila tersedia.
  // Session pooler Supabase memiliki batas koneksi jauh lebih kecil dan sebelumnya
  // membuat login gagal dengan EMAXCONNSESSION saat 15 slot sudah penuh.
  const selected =
    scopedCandidates.find((candidate) => getPoolMode(candidate.value) === "transaction") ??
    scopedCandidates[0];

  // Jika hosting hanya diberi Supabase session-pooler URL (:5432), gunakan endpoint
  // transaction pooler pada host/credential yang sama (:6543). Ini penting untuk
  // deployment multi-instance: session mode mempunyai batas client yang kecil dan
  // setiap rolling restart dapat menahan beberapa koneksi idle sekaligus.
  let effectiveUrl = selected.value;
  if (getPoolMode(effectiveUrl) === "session") {
    try {
      const parsed = new URL(effectiveUrl);
      if (parsed.hostname.includes("pooler.supabase.com")) {
        parsed.port = "6543";
        effectiveUrl = parsed.toString();
      }
    } catch {
      // URL sudah divalidasi lagi oleh parseDbUrl; biarkan nilai asli bila malformed.
    }
  }

  return {
    url: effectiveUrl,
    source: selected.source,
    poolMode: getPoolMode(effectiveUrl),
    projectRef: getCandidateProjectRef(effectiveUrl) ?? expectedProjectRef,
  };
}

const resolved = resolveDbUrl();
const rawUrl = resolved.url;
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

function resolveSslConfig() {
  if (!isSupabase) return false as const;

  const caCandidates = [
    process.env["PGSSLROOTCERT"],
    process.env["SSL_CERT_FILE"],
  ];

  for (const caPath of caCandidates) {
    if (!caPath) continue;
    try {
      return {
        rejectUnauthorized: true,
        ca: readFileSync(caPath, "utf8"),
      } as const;
    } catch {
      // Continue to the next trusted CA source. Verification remains enabled.
    }
  }

  return {
    rejectUnauthorized: true,
    ca: supabaseRootCa,
  } as const;
}

export const dbConfig = {
  url: rawUrl,
  source: resolved.source,
  poolMode: resolved.poolMode,
  projectRef: resolved.projectRef,
  parsed: parsedUrl
    ? {
        host: parsedUrl.host,
        port: parsedUrl.port,
        user: parsedUrl.user,
        password: parsedUrl.password,
        database: parsedUrl.database,
      }
    : { connectionString: rawUrl },
  // Use Supabase's published root CA (or an explicit operator override).
  // Certificate and hostname verification remain enabled in every case.
  ssl: resolveSslConfig(),
  env: isProduction ? "production" : "development",
} as const;
