import { Router, type IRouter } from "express";

const router: IRouter = Router();

router.get("/config", (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL ?? null,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? null,
  });
});

export default router;
