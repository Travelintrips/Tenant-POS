import { Router, type IRouter } from "express";

const router: IRouter = Router();

router.get("/config", (req, res) => {
  const isDev = (process.env["NODE_ENV"] ?? "development") === "development";
  res.json({
    supabaseUrl: isDev
      ? (process.env.SUPABASE_URL_DEV ?? process.env.SUPABASE_URL ?? null)
      : (process.env.SUPABASE_URL ?? null),
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? null,
    env: isDev ? "development" : "production",
  });
});

export default router;
