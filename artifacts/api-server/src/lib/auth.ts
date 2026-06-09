import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { db } from "@workspace/db";
import { usersTable, tenantUserAccessTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { normalizePhoneNumber } from "../services/otp-service";

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
      allowedSites?: number[];
      tenantAccess?: Array<{ tenantId: number; siteId: number; accessLevel: string; status?: string }>;
    }
  }
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
  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, opts.email));

  if (existing) {
    await db
      .update(usersTable)
      .set({ name: opts.name, updatedAt: new Date() })
      .where(eq(usersTable.id, existing.id));
    return { ...existing, phoneNumber: existing.phoneNumber ?? null };
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(usersTable);

  const role = count === 0 ? "owner" : "admin";
  const newId = randomUUID();

  const [created] = await db
    .insert(usersTable)
    .values({ id: newId, email: opts.email, name: opts.name, avatarUrl: opts.avatar, role, status: "active" })
    .onConflictDoUpdate({
      target: usersTable.email,
      set: { name: opts.name, updatedAt: new Date() },
    })
    .returning();

  return { ...created, phoneNumber: null };
}

export async function findOrCreateUserByPhone(opts: {
  phoneNumber: string;
  name?: string;
}): Promise<{ id: string; email: string | null; name: string; avatarUrl: string | null; role: string; phoneNumber: string | null } | null> {
  const normalized = normalizePhoneNumber(opts.phoneNumber);

  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.phoneNumber, normalized));

  if (!existing) return null;
  if (existing.status === "blocked" || existing.status === "inactive") return null;

  await db
    .update(usersTable)
    .set({ lastLoginAt: new Date(), updatedAt: new Date() })
    .where(eq(usersTable.id, existing.id));

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
  };

  if (dbUser.role === "tenant_user") {
    const access = await getTenantAccess(dbUser.id);
    base.tenantAccess = access;
    base.allowedSites = [...new Set(access.map((a) => a.siteId))];
  }

  return base;
}

const clientID = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const domain = process.env.REPLIT_DEV_DOMAIN ?? process.env.REPLIT_DOMAINS?.split(",")[0];

if (clientID && clientSecret && domain) {
  const callbackURL = `https://${domain}/api/auth/google/callback`;

  passport.use(
    new GoogleStrategy(
      { clientID, clientSecret, callbackURL },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value ?? "";
          const name = profile.displayName;
          const avatar = profile.photos?.[0]?.value ?? null;

          const dbUser = await findOrCreateUser({ email, name, avatar });
          const user = await buildSessionUser(dbUser, profile.id);
          done(null, user);
        } catch (err) {
          done(err as Error);
        }
      },
    ),
  );
}

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user as Express.User));

export { getTenantAccess };
export default passport;
