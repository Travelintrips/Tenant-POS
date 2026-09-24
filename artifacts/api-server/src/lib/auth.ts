import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { db } from "@workspace/db";
import { usersTable, tenantUserAccessTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { createPublicKey, randomUUID, verify as verifySignature } from "node:crypto";
import { normalizePhoneNumber } from "../services/otp-service";
import { withDbRetry } from "./db-retry";

declare global {
  namespace Express {
    interface User {
      id: string;
      dbId: string;
      email: string | null;
      name: string;
      phoneNumber: string | null;
      avatar: string | null;
      role: string;
      loginAt: string;
      allowedSites?: number[];
      tenantAccess?: Array<{ tenantId: number; siteId: number; accessLevel: string; status?: string }>;
    }
  }
}

const DEFAULT_GOOGLE_OWNER_EMAILS = ["admcst001@gmail.com"];
const DEFAULT_GOOGLE_ADMIN_EMAILS = ["almanosetiawan@gmail.com"];

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function parseConfiguredEmails(value: string | undefined): string[] {
  return value
    ?.split(",")
    .map((email) => normalizeEmail(email))
    .filter(Boolean) ?? [];
}

const GOOGLE_OWNER_EMAILS = new Set(
  [...DEFAULT_GOOGLE_OWNER_EMAILS, ...parseConfiguredEmails(process.env.GOOGLE_OWNER_EMAILS)]
    .map(normalizeEmail),
);
const GOOGLE_ADMIN_EMAILS = new Set(
  [...DEFAULT_GOOGLE_ADMIN_EMAILS, ...parseConfiguredEmails(process.env.GOOGLE_ADMIN_EMAILS)]
    .map(normalizeEmail),
);

function getGoogleRole(email: string): "owner" | "admin" | null {
  const normalized = normalizeEmail(email);
  if (GOOGLE_OWNER_EMAILS.has(normalized)) return "owner";
  if (GOOGLE_ADMIN_EMAILS.has(normalized)) return "admin";
  return null;
}

function isGoogleAllowedEmail(email: string): boolean {
  return getGoogleRole(email) !== null;
}

async function getTenantAccess(userId: string) {
  const rows = await db
    .select({
      tenantId: tenantUserAccessTable.tenantId,
      siteId: tenantUserAccessTable.siteId,
      accessLevel: tenantUserAccessTable.accessLevel,
      status: tenantUserAccessTable.status,
    })
    .from(tenantUserAccessTable)
    .where(eq(tenantUserAccessTable.userId, userId));
  return rows;
}

export async function findOrCreateUser(opts: {
  email: string;
  name: string;
  avatar: string | null;
}): Promise<{ id: string; email: string | null; name: string; avatarUrl: string | null; role: string; phoneNumber: string | null }> {
  const email = normalizeEmail(opts.email);
  const googleRole = getGoogleRole(email);
  if (!email || !googleRole) {
    throw new Error("GOOGLE_EMAIL_NOT_ALLOWED");
  }

  const [existing] = await withDbRetry(
    () =>
      db
        .select()
        .from(usersTable)
        .where(eq(usersTable.email, email)),
    { label: "google-auth.lookup-user" },
  );

  if (existing) {
    if (existing.status === "blocked" || existing.status === "inactive") {
      throw new Error("GOOGLE_ACCOUNT_INACTIVE");
    }

    const [updated] = await withDbRetry(
      () =>
        db
          .update(usersTable)
          .set({
            name: opts.name,
            avatarUrl: opts.avatar,
            role: googleRole,
            status: "active",
            lastLoginAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(usersTable.id, existing.id))
          .returning(),
      { label: "google-auth.promote-owner" },
    );

    return { ...updated, phoneNumber: updated.phoneNumber ?? null };
  }

  const newId = randomUUID();
  const [created] = await withDbRetry(
    () =>
      db
        .insert(usersTable)
        .values({
          id: newId,
          email,
          name: opts.name,
          avatarUrl: opts.avatar,
          role: googleRole,
          status: "active",
          lastLoginAt: new Date(),
        })
        .onConflictDoUpdate({
          target: usersTable.email,
          set: {
            name: opts.name,
            avatarUrl: opts.avatar,
            role: googleRole,
            status: "active",
            lastLoginAt: new Date(),
            updatedAt: new Date(),
          },
        })
        .returning(),
    { label: "google-auth.upsert-owner" },
  );

  return { ...created, phoneNumber: created.phoneNumber ?? null };
}

export async function findOrCreateUserByPhone(opts: {
  phoneNumber: string;
  name?: string;
}): Promise<{ id: string; email: string | null; name: string; avatarUrl: string | null; role: string; phoneNumber: string | null } | null> {
  const normalized = normalizePhoneNumber(opts.phoneNumber);

  const [existing] = await withDbRetry(
    () =>
      db
        .select()
        .from(usersTable)
        .where(eq(usersTable.phoneNumber, normalized)),
    { label: "wa-auth.lookup-user" },
  );

  if (!existing) return null;
  if (existing.status === "blocked" || existing.status === "inactive") return null;

  await withDbRetry(
    () =>
      db
        .update(usersTable)
        .set({ lastLoginAt: new Date(), updatedAt: new Date() })
        .where(eq(usersTable.id, existing.id)),
    { label: "wa-auth.touch-user" },
  );

  return { ...existing, phoneNumber: existing.phoneNumber ?? null };
}

export async function buildSessionUser(dbUser: {
  id: string;
  email: string | null;
  name: string;
  avatarUrl: string | null;
  role: string;
  phoneNumber: string | null;
}, googleId?: string): Promise<Express.User> {
  const base: Express.User = {
    id: googleId ?? `phone:${dbUser.phoneNumber ?? dbUser.id}`,
    dbId: dbUser.id,
    email: dbUser.email ?? null,
    name: dbUser.name,
    phoneNumber: dbUser.phoneNumber ?? null,
    avatar: dbUser.avatarUrl,
    role: dbUser.role,
    loginAt: new Date().toISOString(),
  };

  if (dbUser.role === "tenant_user") {
    const access = await getTenantAccess(dbUser.id);
    base.tenantAccess = access;
    base.allowedSites = [...new Set(access.map((a) => a.siteId))];
  }

  return base;
}

const GOOGLE_ENV_ALIASES = {
  clientId: ["GOOGLE_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_CLIENTID"],
  clientSecret: ["GOOGLE_CLIENT_SECRET", "GOOGLE_OAUTH_CLIENT_SECRET", "GOOGLE_CLIENTSECRET"],
} as const;

function readRuntimeEnv(names: readonly string[]): string | undefined {
  for (const name of names) {
    const exact = process.env[name]?.trim();
    if (exact) return exact;
  }

  // Recovery untuk environment key yang tanpa sengaja memiliki spasi/casing
  // berbeda di panel hosting. Nilai secret tidak pernah dicetak ke log/API.
  for (const [key, value] of Object.entries(process.env)) {
    const normalizedKey = key.trim().toUpperCase();
    if (names.some((name) => name.toUpperCase() === normalizedKey)) {
      const normalizedValue = value?.trim();
      if (normalizedValue) return normalizedValue;
    }
  }

  return undefined;
}

function resolveGoogleCallbackURL(): string | undefined {
  const configuredCallbackUrl = process.env.GOOGLE_CALLBACK_URL?.trim();
  const configuredAppUrl = process.env.APP_URL?.trim();
  const fallbackDomain =
    process.env.REPLIT_DEV_DOMAIN ?? process.env.REPLIT_DOMAINS?.split(",")[0];
  const isProduction = process.env.NODE_ENV === "production";
  const productionCallbackURL =
    "https://tenant.travelintrips.co.id/api/auth/google/callback";

  if (isProduction) return productionCallbackURL;
  if (configuredCallbackUrl) return configuredCallbackUrl;
  if (configuredAppUrl) {
    return `${configuredAppUrl.replace(/\/+$/, "")}/api/auth/google/callback`;
  }
  if (fallbackDomain) {
    return `https://${fallbackDomain}/api/auth/google/callback`;
  }
  return undefined;
}

export function getGoogleAuthStatus(): {
  enabled: boolean;
  clientID: string | undefined;
  clientSecret: string | undefined;
  callbackURL: string | null;
  clientIdPresent: boolean;
  clientSecretPresent: boolean;
  source: "runtime-env" | "hostinger-build-bridge" | "missing";
} {
  const clientID = readRuntimeEnv(GOOGLE_ENV_ALIASES.clientId);
  const clientSecret = readRuntimeEnv(GOOGLE_ENV_ALIASES.clientSecret);
  const callbackURL = resolveGoogleCallbackURL();

  return {
    enabled: Boolean(clientID && clientSecret && callbackURL),
    clientID,
    clientSecret,
    callbackURL: callbackURL ?? null,
    clientIdPresent: Boolean(clientID),
    clientSecretPresent: Boolean(clientSecret),
    source:
      process.env.GOOGLE_AUTH_ENV_SOURCE === "hostinger-build-bridge"
        ? "hostinger-build-bridge"
        : clientID || clientSecret
          ? "runtime-env"
          : "missing",
  };
}


type GoogleIdTokenClaims = {
  iss: string;
  aud: string | string[];
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  exp: number;
  iat?: number;
};

type GoogleJwk = Record<string, unknown> & { kid?: string; alg?: string; use?: string };

let googleJwksCache: { keys: GoogleJwk[]; expiresAt: number } | null = null;

function decodeJwtJson<T>(segment: string): T {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as T;
}

async function getGoogleJwks(): Promise<GoogleJwk[]> {
  const now = Date.now();
  if (googleJwksCache && googleJwksCache.expiresAt > now) {
    return googleJwksCache.keys;
  }

  const response = await fetch("https://www.googleapis.com/oauth2/v3/certs", {
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    throw new Error(`GOOGLE_JWKS_HTTP_${response.status}`);
  }

  const payload = (await response.json()) as { keys?: GoogleJwk[] };
  const keys = Array.isArray(payload.keys) ? payload.keys : [];
  if (keys.length === 0) throw new Error("GOOGLE_JWKS_EMPTY");

  const cacheControl = response.headers.get("cache-control") ?? "";
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  const maxAgeSeconds = maxAgeMatch ? Number(maxAgeMatch[1]) : 3600;
  googleJwksCache = {
    keys,
    expiresAt: now + Math.max(300, Math.min(maxAgeSeconds, 86_400)) * 1000,
  };

  return keys;
}

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdTokenClaims> {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("GOOGLE_ID_TOKEN_MALFORMED");

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decodeJwtJson<{ alg?: string; kid?: string }>(encodedHeader);
  const claims = decodeJwtJson<GoogleIdTokenClaims>(encodedPayload);

  if (header.alg !== "RS256" || !header.kid) {
    throw new Error("GOOGLE_ID_TOKEN_ALG_INVALID");
  }

  const google = getGoogleAuthStatus();
  if (!google.clientID) throw new Error("GOOGLE_CLIENT_ID_MISSING");

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!claims.exp || claims.exp <= nowSeconds) {
    throw new Error("GOOGLE_ID_TOKEN_EXPIRED");
  }
  if (claims.iat && claims.iat > nowSeconds + 120) {
    throw new Error("GOOGLE_ID_TOKEN_IAT_INVALID");
  }
  if (!["accounts.google.com", "https://accounts.google.com"].includes(claims.iss)) {
    throw new Error("GOOGLE_ID_TOKEN_ISSUER_INVALID");
  }

  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(google.clientID)) {
    throw new Error("GOOGLE_ID_TOKEN_AUDIENCE_INVALID");
  }

  const keys = await getGoogleJwks();
  const jwk = keys.find((key) => key.kid === header.kid);
  if (!jwk) {
    googleJwksCache = null;
    const refreshed = await getGoogleJwks();
    const refreshedJwk = refreshed.find((key) => key.kid === header.kid);
    if (!refreshedJwk) throw new Error("GOOGLE_ID_TOKEN_KID_UNKNOWN");

    const keyObject = createPublicKey({ key: refreshedJwk as any, format: "jwk" });
    const valid = verifySignature(
      "RSA-SHA256",
      Buffer.from(`${encodedHeader}.${encodedPayload}`),
      keyObject,
      Buffer.from(encodedSignature, "base64url"),
    );
    if (!valid) throw new Error("GOOGLE_ID_TOKEN_SIGNATURE_INVALID");
  } else {
    const keyObject = createPublicKey({ key: jwk as any, format: "jwk" });
    const valid = verifySignature(
      "RSA-SHA256",
      Buffer.from(`${encodedHeader}.${encodedPayload}`),
      keyObject,
      Buffer.from(encodedSignature, "base64url"),
    );
    if (!valid) throw new Error("GOOGLE_ID_TOKEN_SIGNATURE_INVALID");
  }

  const email = normalizeEmail(claims.email ?? "");
  if (!claims.email_verified || !email || !isGoogleAllowedEmail(email)) {
    throw new Error("GOOGLE_EMAIL_NOT_ALLOWED");
  }
  if (!claims.sub) throw new Error("GOOGLE_ID_TOKEN_SUB_MISSING");

  return { ...claims, email };
}

let googleStrategyFingerprint: string | null = null;

export function ensureGoogleStrategy(): {
  enabled: boolean;
  callbackURL: string | null;
  clientIdPresent: boolean;
  clientSecretPresent: boolean;
  source: "runtime-env" | "hostinger-build-bridge" | "missing";
} {
  const status = getGoogleAuthStatus();

  if (!status.enabled || !status.clientID || !status.clientSecret || !status.callbackURL) {
    return {
      enabled: false,
      callbackURL: status.callbackURL,
      clientIdPresent: status.clientIdPresent,
      clientSecretPresent: status.clientSecretPresent,
      source: status.source,
    };
  }

  const fingerprint = `${status.clientID}|${status.callbackURL}`;
  if (googleStrategyFingerprint !== fingerprint) {
    passport.use(
      "google",
      new GoogleStrategy(
        {
          clientID: status.clientID,
          clientSecret: status.clientSecret,
          callbackURL: status.callbackURL,
        },
        async (_accessToken, _refreshToken, profile, done) => {
          try {
            const primaryEmail = profile.emails?.[0];
            const email = primaryEmail?.value ?? "";
            const emailVerified = primaryEmail?.verified !== false;
            const name = profile.displayName;
            const avatar = profile.photos?.[0]?.value ?? null;

            if (!emailVerified || !isGoogleAllowedEmail(email)) {
              done(new Error("GOOGLE_EMAIL_NOT_ALLOWED"));
              return;
            }

            const dbUser = await findOrCreateUser({ email, name, avatar });
            const user = await buildSessionUser(dbUser, profile.id);
            done(null, user);
          } catch (err) {
            done(err as Error);
          }
        },
      ),
    );
    googleStrategyFingerprint = fingerprint;
  }

  return {
    enabled: true,
    callbackURL: status.callbackURL,
    clientIdPresent: true,
    clientSecretPresent: true,
    source: status.source,
  };
}

export const googleCallbackURL = resolveGoogleCallbackURL() ?? null;

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user as Express.User));

export { getTenantAccess };
export default passport;
