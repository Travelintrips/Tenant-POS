import { Router, type IRouter } from "express";

const router: IRouter = Router();

router.get("/config", (_req, res) => {
  res.json({
    supabaseUrl: process.env["SUPABASE_URL"] ?? null,
    supabaseAnonKey: process.env["SUPABASE_ANON_KEY"] ?? null,
    env: (process.env["NODE_ENV"] ?? "development") === "development" ? "development" : "production",
  });
});

export default router;
