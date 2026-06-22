import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { getBaseUrl } from "../lib/app-url";

const router: IRouter = Router();

// ── helper: snake_case → camelCase ────────────────────────────────────────────
function toCamel(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())] = v;
  }
  return out;
}

// ── helper: ambil satu draft dari DB ──────────────────────────────────────────
async function getDraftByToken(token: string) {
  const rows = await db.execute(
    sql`SELECT * FROM tenant_draft_agreements WHERE token = ${token} LIMIT 1`
  );
  const row = (rows as { rows: Record<string, unknown>[] }).rows[0];
  return row ? toCamel(row) : null;
}

// ── helper: kirim WA notif ke admin (fire-and-forget) ─────────────────────────
async function notifyAdmin(opts: {
  tenantName: string;
  brandName: string;
  docType: string;
  status: "approved" | "rejected";
  rejectionReason?: string;
  phone?: string | null;
  docUrl: string;
}) {
  const token_api = process.env.FONNTE_TOKEN;
  if (!token_api) return;

  // Ambil nomor admin dari env atau DB
  const adminPhone = process.env.ADMIN_WHATSAPP ?? await (async () => {
    try {
      const r = await db.execute(
        sql`SELECT phone_number FROM users WHERE role IN ('owner', 'admin') AND phone_number IS NOT NULL ORDER BY created_at ASC LIMIT 1`
      );
      const rows = (r as { rows: Record<string, unknown>[] }).rows;
      return (rows[0]?.phone_number as string | undefined) ?? null;
    } catch { return null; }
  })();
  if (!adminPhone) return;

  const docLabel = opts.docType === "perjanjian_sewa" ? "Perjanjian Sewa" : "Surat Minat Menyewa";
  const statusLabel = opts.status === "approved" ? "✅ *DISETUJUI*" : "❌ *TIDAK DISETUJUI*";
  const alasan = opts.rejectionReason ? `\nAlasan: ${opts.rejectionReason}` : "";

  const message = `📄 *Respon ${docLabel}*\n\nStatus: ${statusLabel}\nNama: ${opts.tenantName}\nBrand: ${opts.brandName}${alasan}\n\nLihat dokumen:\n${opts.docUrl}`;

  try {
    const adminDigits = String(adminPhone).replace(/\D/g, "");
    const adminTarget = adminDigits.startsWith("0") ? "62" + adminDigits.slice(1) : adminDigits.startsWith("62") ? adminDigits : "62" + adminDigits;
    await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: { Authorization: token_api, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ target: adminTarget, message, delay: "2" }).toString(),
    });
  } catch {
    // fire-and-forget, ignore error
  }
}

// ── helper: kirim WA notif ke tenant (fire-and-forget) ────────────────────────
async function notifyTenant(opts: {
  tenantPhone: string;
  tenantName: string;
  docType: string;
  status: "approved" | "rejected";
  mallName?: string;
}) {
  const token_api = process.env.FONNTE_TOKEN;
  if (!token_api) return;

  const docLabel = opts.docType === "perjanjian_sewa" ? "Perjanjian Sewa" : "Surat Minat Menyewa";
  const mall = opts.mallName ?? "Mal Kami";

  let message: string;
  if (opts.status === "approved") {
    message = `✅ *Terima kasih, ${opts.tenantName}!*\n\nKami telah menerima persetujuan Anda atas *${docLabel}* di ${mall}.\n\nTim kami akan segera menghubungi Anda untuk langkah selanjutnya.\n\nSalam hangat,\nManajemen ${mall}`;
  } else {
    message = `📄 Kami menerima respon Anda atas *${docLabel}* di ${mall}.\n\nJika ada pertanyaan atau ingin mendiskusikan lebih lanjut, silakan hubungi tim kami.\n\nSalam hangat,\nManajemen ${mall}`;
  }

  try {
    const tDigits = String(opts.tenantPhone).replace(/\D/g, "");
    const tTarget = tDigits.startsWith("0") ? "62" + tDigits.slice(1) : tDigits.startsWith("62") ? tDigits : "62" + tDigits;
    await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: { Authorization: token_api, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ target: tTarget, message, delay: "2" }).toString(),
    });
  } catch {
    // fire-and-forget
  }
}

// ── GET /api/dokumen/:token ───────────────────────────────────────────────────
// Public — ambil data dokumen berdasarkan token
router.get("/dokumen/:token", async (req: Request, res: Response) => {
  const token = req.params["token"] as string;
  if (!token || token.length < 8) {
    res.status(400).json({ error: "Token tidak valid" });
    return;
  }

  try {
    const draft = await getDraftByToken(token);
    if (!draft) {
      res.status(404).json({ error: "Dokumen tidak ditemukan atau link tidak valid" });
      return;
    }

    // Cek expired
    if (draft.expires_at && new Date(draft.expires_at as string) < new Date()) {
      res.status(410).json({ error: "Link dokumen ini sudah kedaluwarsa" });
      return;
    }

    // Hapus field sensitif dari response
    const { ip_address, created_by, ...safe } = draft as Record<string, unknown>;
    void ip_address; void created_by;
    res.json(safe);
  } catch (err) {
    console.error("[draft-public] GET /dokumen/:token error:", err);
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

// ── POST /api/dokumen/:token/setuju ──────────────────────────────────────────
// Public — calon tenant menyetujui dokumen
const setujuSchema = z.object({
  respondedName: z.string().min(2, "Nama minimal 2 karakter").max(200),
  respondedEmail: z.string().email("Email tidak valid").optional().or(z.literal("")),
  respondedPhone: z.string().max(30).optional(),
});

router.post("/dokumen/:token/setuju", async (req: Request, res: Response) => {
  const token = req.params["token"] as string;
  if (!token || token.length < 8) {
    res.status(400).json({ error: "Token tidak valid" });
    return;
  }

  const parsed = setujuSchema.safeParse(req.body);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    res.status(400).json({ error: msg });
    return;
  }
  const { respondedName, respondedEmail, respondedPhone } = parsed.data;

  try {
    const draft = await getDraftByToken(token);
    if (!draft) {
      res.status(404).json({ error: "Dokumen tidak ditemukan" });
      return;
    }
    if (draft.expires_at && new Date(draft.expires_at as string) < new Date()) {
      res.status(410).json({ error: "Link dokumen sudah kedaluwarsa" });
      return;
    }
    if (draft.status !== "pending") {
      res.status(409).json({
        error: "Dokumen ini sudah pernah direspon",
        status: draft.status,
      });
      return;
    }

    const ip = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim()
      ?? req.socket.remoteAddress
      ?? null;

    await db.execute(sql`
      UPDATE tenant_draft_agreements
      SET
        status = 'approved',
        responded_at = NOW(),
        responded_name = ${respondedName},
        responded_email = ${respondedEmail ?? null},
        responded_phone = ${respondedPhone ?? null},
        ip_address = ${ip},
        updated_at = NOW()
      WHERE token = ${token}
    `);

    // Notifikasi async
    const baseUrl = await getBaseUrl().catch(() => undefined);
    const docUrl = baseUrl ? `${baseUrl}/dokumen/${token}` : `/dokumen/${token}`;
    notifyAdmin({
      tenantName: draft.tenant_name as string,
      brandName: draft.brand_name as string,
      docType: draft.doc_type as string,
      status: "approved",
      phone: draft.phone as string | null,
      docUrl,
    }).catch(() => {});

    if (draft.phone) {
      notifyTenant({
        tenantPhone: draft.phone as string,
        tenantName: draft.tenant_name as string,
        docType: draft.doc_type as string,
        status: "approved",
      }).catch(() => {});
    }

    res.json({
      success: true,
      message: "Terima kasih! Persetujuan Anda telah kami catat. Tim kami akan segera menghubungi Anda.",
      status: "approved",
    });
  } catch (err) {
    console.error("[draft-public] POST setuju error:", err);
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

// ── POST /api/dokumen/:token/tolak ───────────────────────────────────────────
// Public — calon tenant tidak menyetujui dokumen
const tolakSchema = z.object({
  respondedName: z.string().min(2, "Nama minimal 2 karakter").max(200),
  respondedEmail: z.string().email("Email tidak valid").optional().or(z.literal("")),
  respondedPhone: z.string().max(30).optional(),
  rejectionReason: z.string().min(5, "Alasan minimal 5 karakter").max(1000),
});

router.post("/dokumen/:token/tolak", async (req: Request, res: Response) => {
  const token = req.params["token"] as string;
  if (!token || token.length < 8) {
    res.status(400).json({ error: "Token tidak valid" });
    return;
  }

  const parsed = tolakSchema.safeParse(req.body);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    res.status(400).json({ error: msg });
    return;
  }
  const { respondedName, respondedEmail, respondedPhone, rejectionReason } = parsed.data;

  try {
    const draft = await getDraftByToken(token);
    if (!draft) {
      res.status(404).json({ error: "Dokumen tidak ditemukan" });
      return;
    }
    if (draft.expires_at && new Date(draft.expires_at as string) < new Date()) {
      res.status(410).json({ error: "Link dokumen sudah kedaluwarsa" });
      return;
    }
    if (draft.status !== "pending") {
      res.status(409).json({
        error: "Dokumen ini sudah pernah direspon",
        status: draft.status,
      });
      return;
    }

    const ip = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim()
      ?? req.socket.remoteAddress
      ?? null;

    await db.execute(sql`
      UPDATE tenant_draft_agreements
      SET
        status = 'rejected',
        responded_at = NOW(),
        responded_name = ${respondedName},
        responded_email = ${respondedEmail ?? null},
        responded_phone = ${respondedPhone ?? null},
        rejection_reason = ${rejectionReason},
        ip_address = ${ip},
        updated_at = NOW()
      WHERE token = ${token}
    `);

    const baseUrl = await getBaseUrl().catch(() => undefined);
    const docUrl = baseUrl ? `${baseUrl}/dokumen/${token}` : `/dokumen/${token}`;
    notifyAdmin({
      tenantName: draft.tenant_name as string,
      brandName: draft.brand_name as string,
      docType: draft.doc_type as string,
      status: "rejected",
      rejectionReason,
      phone: draft.phone as string | null,
      docUrl,
    }).catch(() => {});

    if (draft.phone) {
      notifyTenant({
        tenantPhone: draft.phone as string,
        tenantName: draft.tenant_name as string,
        docType: draft.doc_type as string,
        status: "rejected",
      }).catch(() => {});
    }

    res.json({
      success: true,
      message: "Respon Anda telah kami catat. Terima kasih atas kejujuran Anda.",
      status: "rejected",
    });
  } catch (err) {
    console.error("[draft-public] POST tolak error:", err);
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

export default router;
