import { Router, type IRouter } from "express";
import { publicReadRateLimiter } from "../middlewares/rate-limit";

const router: IRouter = Router();

const isProduction = process.env["NODE_ENV"] === "production";

const resolvedUrl = isProduction
  ? (process.env["SUPABASE_URL"] ?? null)
  : (process.env["SUPABASE_URL_DEV"] ?? process.env["SUPABASE_URL"] ?? null);

const resolvedAnonKey = isProduction
  ? (process.env["SUPABASE_ANON_KEY"] ?? null)
  : (process.env["SUPABASE_ANON_KEY_DEV"] ?? process.env["SUPABASE_ANON_KEY"] ?? null);

// Endpoint ini sengaja publik (tanpa autentikasi) karena hanya mengembalikan
// konfigurasi klien Supabase yang bersifat publik (anon key = public key,
// bukan service role key). Jangan pernah mengembalikan service role key di sini.
router.get("/config", publicReadRateLimiter, (_req, res) => {
  res.json({
    supabaseUrl: resolvedUrl,
    supabaseAnonKey: resolvedAnonKey,
    env: isProduction ? "production" : "development",
  });
});

export default router;
