import { Router, type IRouter } from "express";

const router: IRouter = Router();

const isProduction = process.env["NODE_ENV"] === "production";

const resolvedAnonKey = isProduction
  ? (process.env["SUPABASE_ANON_KEY"] ?? null)
  : (process.env["SUPABASE_ANON_KEY_DEV"] ?? process.env["SUPABASE_ANON_KEY"] ?? null);

router.get("/config", (_req, res) => {
  res.json({
    supabaseUrl: process.env["SUPABASE_URL"] ?? null,
    supabaseAnonKey: resolvedAnonKey,
    env: isProduction ? "production" : "development",
  });
});

export default router;
