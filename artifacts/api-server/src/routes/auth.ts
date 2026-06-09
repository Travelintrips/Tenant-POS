import { Router, type IRouter } from "express";
import passport from "../lib/auth";

const router: IRouter = Router();

if (process.env.NODE_ENV !== "production") {
  router.post("/auth/dev-login", (req, res) => {
    const devUser: Express.User = {
      id: "dev-001",
      email: "dev@localhost",
      name: "Dev User",
      avatar: null,
    };
    req.login(devUser, (err) => {
      if (err) {
        res.status(500).json({ error: "Dev login gagal" });
        return;
      }
      res.json(devUser);
    });
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
  res.json(req.user);
});

router.post("/auth/logout", (req, res) => {
  req.logout(() => {
    res.json({ ok: true });
  });
});

export default router;
