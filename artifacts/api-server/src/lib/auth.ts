import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { db } from "@workspace/db";
import { usersTable, tenantUserAccessTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
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

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function getGoogleOwnerEmails(): Set<string> {
  const configured = process.env.GOOGLE_OWNER_EMAILS
    ?.split(",")
    .map((email) => normalizeEmail(email))
    .filter(Boolean) ?? [];

  return new Set(
    (configured.length > 0 ? configured : DEFAULT_GOOGLE_OWNER_EMAILS).map(normalizeEmail),
  );
}

const GOOGLE_OWNER_EMAILS = getGoogleOwnerEmails();

function isGoogleOwnerEmail(email: string): boolean {
  return GOOGLE_OWNER_EMAILS.has(normalizeEmail(email));
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
  if (!email || !isGoogleOwnerEmail(email)) {
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
            role: "owner",
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
          role: "owner",
          status: "active",
          lastLoginAt: new Date(),
        })
        .onConflictDoUpdate({
          target: usersTable.email,
          set: {
            name: opts.name,
            avatarUrl: opts.avatar,
            role: "owner",
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

            if (!emailVerified || !isGoogleOwnerEmail(email)) {
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
