import { readFileSync } from "node:fs";
import { supabaseRootCa } from "./supabase-root-ca";

const isProduction = (process.env["NODE_ENV"] ?? "development") === "production";

type DbPoolMode = "transaction" | "session" | "direct";
type DbUrlSource =
  | "SUPABASE_DATABASE_URL"
  | "SUPABASE_DATABASE_URL_DEV"
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

    const usernameMatch = username.match(/^[^.]+\.([a-z0-9]+)$/i);
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
    if (parsed.hostname.includes("pooler.supabase.com")) {
      return parsed.port === "6543" ? "transaction" : "session";
    }

    // Supabase Dedicated Pooler memakai host db.<project>.supabase.co pada
    // port 6543 untuk transaction mode. Jangan klasifikasikan endpoint ini
    // sebagai direct hanya karena hostname-nya sama dengan endpoint database.
    if (
      /^db\.[a-z0-9]+\.supabase\.co$/i.test(parsed.hostname) &&
      parsed.port === "6543"
    ) {
      return "transaction";
    }

    return "direct";
  } catch {
    return "direct";
  }
}

function isInvalidSupabaseEndpoint(url: string): boolean {
  try {
    const parsed = new URL(url);
    const isProjectDbHost = /^db\.[a-z0-9]+\.supabase\.co$/i.test(parsed.hostname);

    // db.<project>.supabase.co:5432 = direct connection
    // db.<project>.supabase.co:6543 = Dedicated Transaction Pooler
    // Keduanya valid. Tolak hanya port eksplisit lain pada hostname project DB.
    return (
      isProjectDbHost &&
      parsed.port !== "" &&
      parsed.port !== "5432" &&
      parsed.port !== "6543"
    );
  } catch {
    return false;
  }
}

function normalizeCandidate(candidate: DbCandidate, expectedProjectRef: string | null): DbCandidate {
  try {
    const parsed = new URL(candidate.value);

    // Dedicated Transaction Pooler Supabase dapat memakai
    // db.<project>.supabase.co:6543. Pertahankan URL ini apa adanya; mengubahnya
    // ke :5432 akan memindahkan runtime ke direct connection dan dapat memutus
    // deployment IPv4-only seperti Hostinger.
    if (parsed.hostname.includes("pooler.supabase.com")) {
      const username = decodeURIComponent(parsed.username);
      if (expectedProjectRef && !username.includes(".")) {
        parsed.username = `${username || "postgres"}.${expectedProjectRef}`;
      }
      if (isProduction && parsed.port === "5432") {
        parsed.port = "6543";
      }
      return { ...candidate, value: parsed.toString() };
    }

    return candidate;
  } catch {
    return candidate;
  }
}

function isNativeTransactionPoolerUrl(value: string | undefined): boolean {
  if (!value?.trim()) return false;
  try {
    const parsed = new URL(value.trim());
    const isSharedPooler = parsed.hostname.includes("pooler.supabase.com");
    const isDedicatedPooler = /^db\.[a-z0-9]+\.supabase\.co$/i.test(parsed.hostname);
    return (isSharedPooler || isDedicatedPooler) && parsed.port === "6543";
  } catch {
    return false;
  }
}

function getCandidates(): DbCandidate[] {
  const prodPoolerUrl = process.env["SUPABASE_POOLER_URL"];
  const productionOrdered: Array<[DbUrlSource, string | undefined]> =
    isNativeTransactionPoolerUrl(prodPoolerUrl)
      ? [
          // URL yang eksplisit untuk production harus menang atas credential generik.
          // Ini mencegah Hostinger memakai SUPABASE_DATABASE_URL lama/stale setelah
          // rotasi credential sementara SUPABASE_PG_URL_PROD sudah diperbarui.
          ["SUPABASE_PG_URL_PROD", process.env["SUPABASE_PG_URL_PROD"]],
          ["SUPABASE_POOLER_URL", prodPoolerUrl],
          ["SUPABASE_PG_URL", process.env["SUPABASE_PG_URL"]],
          ["SUPABASE_DATABASE_URL", process.env["SUPABASE_DATABASE_URL"]],
          ["DATABASE_URL", process.env["DATABASE_URL"]],
        ]
      : [
          // Bila explicit pooler malformed/legacy, tetap prioritaskan credential
          // production-specific sebelum credential generik/canonical.
          ["SUPABASE_PG_URL_PROD", process.env["SUPABASE_PG_URL_PROD"]],
          ["SUPABASE_PG_URL", process.env["SUPABASE_PG_URL"]],
          ["SUPABASE_DATABASE_URL", process.env["SUPABASE_DATABASE_URL"]],
          ["DATABASE_URL", process.env["DATABASE_URL"]],
          ["SUPABASE_POOLER_URL", prodPoolerUrl],
        ];

  const ordered: Array<[DbUrlSource, string | undefined]> = isProduction
    ? productionOrdered
    : [
        ["SUPABASE_DATABASE_URL_DEV", process.env["SUPABASE_DATABASE_URL_DEV"]],
        ["SUPABASE_PG_URL_DEV", process.env["SUPABASE_PG_URL_DEV"]],
        ["SUPABASE_DATABASE_URL", process.env["SUPABASE_DATABASE_URL"]],
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
  const rawCandidates = getCandidates();

  if (rawCandidates.length === 0) {
    throw new Error(
      "SUPABASE_DATABASE_URL, SUPABASE_POOLER_URL, SUPABASE_PG_URL, SUPABASE_PG_URL_PROD, SUPABASE_PG_URL_DEV, atau DATABASE_URL harus diset di Secrets/Config",
    );
  }

  const expectedProjectRef = getSupabaseProjectRef();
  const candidates = rawCandidates
    .map((candidate) => normalizeCandidate(candidate, expectedProjectRef))
    .filter((candidate) => !isInvalidSupabaseEndpoint(candidate.value));

  if (candidates.length === 0) {
    throw new Error(
      "Konfigurasi database Supabase tidak valid. Gunakan connection string dari Supabase Connect (Direct, Session Pooler, atau Transaction Pooler).",
    );
  }

  const matchingProjectCandidates = expectedProjectRef
    ? candidates.filter((candidate) => {
        try {
          const parsed = new URL(candidate.value);
          const isSupabaseCandidate =
            parsed.hostname.includes("supabase.co") ||
            parsed.hostname.includes("pooler.supabase.com");
          return isSupabaseCandidate && getCandidateProjectRef(candidate.value) === expectedProjectRef;
        } catch {
          return false;
        }
      })
    : candidates;

  const scopedCandidates =
    matchingProjectCandidates.length > 0 ? matchingProjectCandidates : candidates;

  // Urutan env adalah urutan kepercayaan credential. Native transaction pooler
  // diprioritaskan; pooler URL legacy/malformed didemote agar password stale tidak menang.
  const selected = scopedCandidates[0];
  const effectiveUrl = selected.value;

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

const parsedUrl = parseDbUrl(rawUrl);

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
  parsed: { connectionString: rawUrl },
  host: parsedUrl?.host ?? null,
  port: parsedUrl?.port ?? null,
  // Use Supabase's published root CA (or an explicit operator override).
  // Certificate and hostname verification remain enabled in every case.
  ssl: resolveSslConfig(),
  env: isProduction ? "production" : "development",
} as const;
