import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";

declare global {
  namespace Express {
    interface User {
      id: string;
      email: string;
      name: string;
      avatar: string | null;
    }
  }
}

const clientID = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const domain = process.env.REPLIT_DEV_DOMAIN;

if (clientID && clientSecret && domain) {
  const callbackURL = `https://${domain}/api/auth/google/callback`;

  passport.use(
    new GoogleStrategy(
      { clientID, clientSecret, callbackURL },
      (_accessToken, _refreshToken, profile, done) => {
        const user: Express.User = {
          id: profile.id,
          email: profile.emails?.[0]?.value ?? "",
          name: profile.displayName,
          avatar: profile.photos?.[0]?.value ?? null,
        };
        done(null, user);
      },
    ),
  );
}

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user as Express.User));

export default passport;
