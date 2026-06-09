import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";

declare global {
  namespace Express {
    interface User {
      id: string;
      dbId: number;
      email: string;
      name: string;
      avatar: string | null;
      role: string;
    }
  }
}

async function findOrCreateUser(opts: {
  email: string;
  name: string;
  avatar: string | null;
}): Promise<{ id: number; email: string; name: string; avatarUrl: string | null; role: string }> {
  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, opts.email));

  if (existing) {
    await db
      .update(usersTable)
      .set({ name: opts.name, avatarUrl: opts.avatar, updatedAt: new Date() })
      .where(eq(usersTable.id, existing.id));
    return { ...existing, avatarUrl: opts.avatar };
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(usersTable);

  const role = count === 0 ? "owner" : "admin";

  const [created] = await db
    .insert(usersTable)
    .values({ email: opts.email, name: opts.name, avatarUrl: opts.avatar, role })
    .returning();

  return created;
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

          const user: Express.User = {
            id: profile.id,
            dbId: dbUser.id,
            email: dbUser.email,
            name: dbUser.name,
            avatar: dbUser.avatarUrl,
            role: dbUser.role,
          };
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

export { findOrCreateUser };
export default passport;
