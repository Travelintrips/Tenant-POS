import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { z } from "zod";
import crypto from "crypto";

const router: IRouter = Router();

const registerSchema = z.object({
  picName: z.string().min(2, "Nama PIC/penanggung jawab minimal 2 karakter").max(300),
  brandName: z.string().min(1, "Nama brand/usaha wajib diisi").max(300),
  businessType: z.string().min(1, "Jenis usaha wajib diisi").max(200),
  phone: z.string().min(8, "Nomor WhatsApp tidak valid").max(30),
  email: z.string().email("Format email tidak valid").optional().or(z.literal("")),
  address: z.string().max(500).optional(),
  interestedUnit: z.string().max(300).optional(),
  notes: z.string().max(2000).optional(),
});

// ── POST /api/calon-tenant/daftar ─────────────────────────────────────────────
// Public — self-registration calon tenant baru
router.post("/calon-tenant/daftar", async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    res.status(400).json({ error: msg });
    return;
  }

  const d = parsed.data;
  const token = crypto.randomBytes(20).toString("hex");
  const ip = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim()
    ?? req.socket.remoteAddress
    ?? null;

  try {
    await db.execute(sql`
      INSERT INTO tenant_draft_agreements (
        token, site_id, doc_type,
        pic_name, tenant_name, brand_name, business_type,
        email, phone, address, interested_unit,
        notes, source, ip_address, status
      ) VALUES (
        ${token}, 0, 'surat_minat',
        ${d.picName}, ${d.picName}, ${d.brandName}, ${d.businessType},
        ${d.email || null}, ${d.phone}, ${d.address || null}, ${d.interestedUnit || null},
        ${d.notes || null}, 'self_register', ${ip}, 'pending'
      )
    `);

    // Notifikasi admin via WA (fire-and-forget)
    const fonnteToken = process.env.FONNTE_TOKEN;
    if (fonnteToken) {
      // Ambil nomor WA admin/owner dari env atau DB
      const adminPhone = process.env.ADMIN_WHATSAPP ?? await (async () => {
        try {
          const r = await db.execute(
            sql`SELECT phone_number FROM users WHERE role IN ('owner', 'admin') AND phone_number IS NOT NULL ORDER BY created_at ASC LIMIT 1`
          );
          const rows = (r as { rows: Record<string, unknown>[] }).rows;
          return (rows[0]?.phone_number as string | undefined) ?? null;
        } catch {
          return null;
        }
      })();

      if (adminPhone) {
        const msg = `📋 *Pendaftaran Calon Tenant Baru*\n\nNama PIC: ${d.picName}\nBrand/Usaha: ${d.brandName}\nJenis Usaha: ${d.businessType}\nWhatsApp: ${d.phone}${d.interestedUnit ? `\nUnit Diminati: ${d.interestedUnit}` : ""}${d.notes ? `\nCatatan: ${d.notes}` : ""}\n\nSilakan buka portal admin untuk meninjau dan membuat dokumen surat minat.`;
        fetch("https://api.fonnte.com/send", {
          method: "POST",
          headers: { Authorization: fonnteToken, "Content-Type": "application/json" },
          body: JSON.stringify({ target: adminPhone, message: msg }),
        }).catch(() => {});
      }
    }

    res.status(201).json({
      success: true,
      message: "Terima kasih! Data Anda sudah kami terima. Tim kami akan mengirimkan dokumen penawaran melalui WhatsApp dalam waktu dekat.",
    });
  } catch (err) {
    console.error("[calon-tenant] POST /daftar error:", err);
    res.status(500).json({ error: "Terjadi kesalahan server. Silakan coba lagi." });
  }
});

export default router;
