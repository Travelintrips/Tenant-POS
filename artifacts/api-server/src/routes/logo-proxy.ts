import { Router, type IRouter } from "express";
import { supabaseUrl } from "../lib/supabase-storage";

const router: IRouter = Router();

const SUPABASE_KEY =
  process.env["SUPABASE_SERVICE_ROLE_KEY_DEV"] ??
  process.env["SUPABASE_SERVICE_ROLE_KEY"] ??
  "";

/**
 * GET /api/logo-proxy?url=<encoded_supabase_url>
 *
 * Proxy gambar logo dari Supabase Storage.
 * Tidak perlu login — logo tenant adalah data publik.
 * Endpoint ini memastikan gambar bisa diakses meski bucket Supabase
 * punya RLS policy yang memblokir akses langsung dari browser.
 */
router.get("/logo-proxy", async (req, res) => {
  const raw = req.query["url"];
  if (typeof raw !== "string" || !raw) {
    res.status(400).json({ error: "Parameter url diperlukan" });
    return;
  }

  let targetUrl: string;
  try {
    targetUrl = decodeURIComponent(raw);
  } catch {
    res.status(400).json({ error: "URL tidak valid" });
    return;
  }

  // Validasi: hanya izinkan URL dari Supabase project yang dikonfigurasi
  const allowedOrigin = supabaseUrl.replace(/\/$/, "");
  if (!allowedOrigin || !targetUrl.startsWith(allowedOrigin)) {
    res.status(403).json({ error: "Origin URL tidak diizinkan" });
    return;
  }

  try {
    const headers: Record<string, string> = {
      "User-Agent": "MallAdminPortal/1.0",
    };

    if (SUPABASE_KEY) {
      headers["Authorization"] = `Bearer ${SUPABASE_KEY}`;
      headers["apikey"] = SUPABASE_KEY;
    }

    const upstream = await fetch(targetUrl, { headers });

    if (!upstream.ok) {
      res.status(upstream.status).json({ error: "Gagal mengambil gambar dari storage" });
      return;
    }

    const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
    const buffer = await upstream.arrayBuffer();

    res.set({
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    });
    res.send(Buffer.from(buffer));
  } catch (err) {
    res.status(502).json({ error: "Gagal menghubungi storage" });
  }
});

export default router;
