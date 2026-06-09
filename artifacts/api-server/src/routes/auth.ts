import { Router, type IRouter } from "express";
import passport from "../lib/auth";
import { db } from "@workspace/db";
import { usersTable, USER_ROLES, type UserRole } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { findOrCreateUser } from "../lib/auth";

const router: IRouter = Router();

if (process.env.NODE_ENV !== "production") {
  router.post("/auth/dev-login", async (req, res) => {
    const { email, name, role } = req.body as { email?: string; name?: string; role?: string };

    const effectiveEmail = email ?? "dev@localhost";
    const effectiveName = name ?? "Dev User";
    const effectiveRole: UserRole = (USER_ROLES.includes(role as UserRole) ? role : "admin") as UserRole;

    try {
      const dbUser = await findOrCreateUser({
        email: effectiveEmail,
        name: effectiveName,
        avatar: null,
      });

      if (dbUser.role !== effectiveRole) {
        await db
          .update(usersTable)
          .set({ role: effectiveRole, updatedAt: new Date() })
          .where(eq(usersTable.id, dbUser.id));
        dbUser.role = effectiveRole;
      }

      const sessionUser: Express.User = {
        id: `dev:${effectiveEmail}`,
        dbId: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        avatar: dbUser.avatarUrl,
        role: dbUser.role,
      };

      req.login(sessionUser, (err) => {
        if (err) {
          res.status(500).json({ error: "Login gagal" });
          return;
        }
        res.json(sessionUser);
      });
    } catch (err) {
      console.error("[dev-login] Error:", err);
      res.status(500).json({ error: "Gagal membuat sesi dev login" });
    }
  });
}

router.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));

router.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/login?error=1" }),
  (_req, res) => {
    res.redirect("/");
  },
);

router.get("/auth/me", (req, res) => {
  if (!req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: "Tidak terautentikasi" });
    return;
  }
  res.json({
    id: req.user.id,
    dbId: req.user.dbId,
    email: req.user.email,
    name: req.user.name,
    avatar: req.user.avatar,
    role: req.user.role,
  });
});

router.post("/auth/logout", (req, res) => {
  req.logout(() => {
    res.json({ ok: true });
  });
});

export default router;
