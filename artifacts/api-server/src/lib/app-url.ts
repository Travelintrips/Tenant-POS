import { db } from "@workspace/db";
import { systemSettingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const SETTINGS_KEY = "mall_config";
const CACHE_TTL_MS = 60_000;

let _cached: { baseUrl: string; expiresAt: number } | null = null;

async function getPaymentDomainFromDb(): Promise<string | undefined> {
  try {
    const [row] = await db
      .select({ value: systemSettingsTable.value })
      .from(systemSettingsTable)
      .where(eq(systemSettingsTable.key, SETTINGS_KEY));
    const val = (row?.value as Record<string, unknown> | undefined)?.paymentDomain;
    return typeof val === "string" && val.trim().length > 0 ? val.trim().replace(/\/$/, "") : undefined;
  } catch {
    return undefined;
  }
}

export async function getBaseUrl(): Promise<string | undefined> {
  const now = Date.now();
  if (_cached && now < _cached.expiresAt) return _cached.baseUrl;

  const fromDb = await getPaymentDomainFromDb();
  const fromEnv = process.env.APP_URL?.replace(/\/$/, "");
  const fromDomain = process.env.REPLIT_DEV_DOMAIN ?? process.env.REPLIT_DOMAINS?.split(",")[0];

  const baseUrl = fromDb ?? fromEnv ?? (fromDomain ? `https://${fromDomain}` : undefined);

  if (baseUrl) {
    _cached = { baseUrl, expiresAt: now + CACHE_TTL_MS };
  }
  return baseUrl;
}

export function invalidateBaseUrlCache(): void {
  _cached = null;
}
