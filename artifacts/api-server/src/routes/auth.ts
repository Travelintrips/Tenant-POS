import { Router, type IRouter } from "express";
import passport from "../lib/auth";

const router: IRouter = Router();

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
