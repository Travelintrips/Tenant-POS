import { Router, type IRouter } from "express";
import crypto from "node:crypto";
import { devLoginRateLimiter } from "../middlewares/rate-limit";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function getSupabaseHttpConfig() {
  const baseUrl = process.env.SUPABASE_URL?.trim().replace(/\/+$/, "");
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim();

  return { baseUrl, key };
}

async function restGet(path: string) {
  const { baseUrl, key } = getSupabaseHttpConfig();
  if (!baseUrl || !key) {
    throw new Error("SUPABASE_HTTP_FALLBACK_NOT_CONFIGURED");
  }

  const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`SUPABASE_REST_${response.status}: ${body.slice(0, 300)}`);
  }

  return response.json();
}

router.post("/emergency/overview", devLoginRateLimiter, async (req, res) => {
  if (process.env.ENABLE_DEV_LOGIN !== "true") {
    res.status(404).json({ error: "Emergency access tidak aktif" });
    return;
  }

  const expected = process.env.DEV_LOGIN_SECRET ?? "";
  const supplied = typeof req.body?.password === "string" ? req.body.password : "";

  if (!expected || !safeEqual(supplied, expected)) {
    res.status(401).json({ error: "Password emergency tidak valid" });
    return;
  }

  try {
    const [payments, invoices, bookings] = await Promise.all([
      restGet(
        "tenant_payments?select=id,payment_number,tenant_id,site_id,amount,status,payment_status,approval_status,paid_at,created_at,is_voided&is_voided=eq.false&order=created_at.desc&limit=25",
      ),
      restGet(
        "tenant_invoices?select=id,invoice_number,tenant_id,site_id,total_amount,paid_amount,outstanding_amount,status,due_date,created_at&order=created_at.desc&limit=25",
      ),
      restGet(
        "tenant_bookings?select=id,order_number,tenant_id,site_id,booking_status,payment_status,total_amount,paid_amount,remaining_amount,created_at&order=created_at.desc&limit=25",
      ),
    ]);

    res.setHeader("Cache-Control", "no-store");
    res.json({
      ok: true,
      mode: "supabase-rest-readonly",
      generatedAt: new Date().toISOString(),
      payments,
      invoices,
      bookings,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ message }, "[emergency] Supabase REST overview gagal");
    res.status(503).json({
      error: "Emergency read-only belum dapat mengambil data",
      code: message.startsWith("SUPABASE_HTTP_FALLBACK_NOT_CONFIGURED")
        ? "HTTP_FALLBACK_NOT_CONFIGURED"
        : "SUPABASE_REST_UNAVAILABLE",
    });
  }
});

export default router;
