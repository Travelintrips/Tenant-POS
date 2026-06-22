import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { z } from "zod";
import crypto from "crypto";
import { registrationRateLimiter } from "../middlewares/rate-limit";
import { requireAuth, requireAnyRole } from "../middlewares/auth";
import { sendCalonTenantApproved, sendCalonTenantRejected, sendCalonTenantReminder, getSiteCompanyName } from "../lib/whatsapp";
import { logAudit } from "../lib/audit";

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
// Rate limit: 5 request per IP per 10 menit (anti-spam)
router.post("/calon-tenant/daftar", registrationRateLimiter, async (req: Request, res: Response) => {
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
    const fonnteToken = process.env.FONNTE_API_KEY ?? process.env.FONNTE_TOKEN;
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
        const adminDigits = String(adminPhone).replace(/\D/g, "");
        const adminTarget = adminDigits.startsWith("0") ? "62" + adminDigits.slice(1) : adminDigits.startsWith("62") ? adminDigits : "62" + adminDigits;
        fetch("https://api.fonnte.com/send", {
          method: "POST",
          headers: { Authorization: fonnteToken, "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ target: adminTarget, message: msg, delay: "2" }).toString(),
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

// ── GET /api/calon-tenant/pending-count ───────────────────────────────────────
// Protected — hanya admin/owner yang login; dipakai untuk polling badge sidebar
router.get("/calon-tenant/pending-count", requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await db.execute(sql`
      SELECT
        COUNT(*)::int                    AS pending_count,
        MAX(created_at)::text            AS latest_created_at
      FROM tenant_draft_agreements
      WHERE status = 'pending'
        AND source = 'self_register'
    `);
    const row = (result as { rows: Record<string, unknown>[] }).rows[0];
    res.json({
      success: true,
      pendingCount: Number(row?.pending_count ?? 0),
      latestCreatedAt: (row?.latest_created_at as string | null) ?? null,
    });
  } catch (err) {
    console.error("[calon-tenant] GET /pending-count error:", err);
    res.status(500).json({ success: false, error: "Terjadi kesalahan server." });
  }
});

// ── PATCH /api/calon-tenant/:id/status ────────────────────────────────────────
// Admin/owner — approve atau reject calon tenant dari Draf Perjanjian
router.patch(
  "/calon-tenant/:id/status",
  requireAuth,
  requireAnyRole("admin", "owner"),
  async (req: Request, res: Response) => {
    const id = parseInt(req.params["id"] as string);
    if (isNaN(id)) {
      res.status(400).json({ error: "ID tidak valid" });
      return;
    }

    const schema = z.object({
      status: z.enum(["approved", "rejected"], {
        errorMap: () => ({ message: "Status harus 'approved' atau 'rejected'" }),
      }),
      note: z.string().max(1000).optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues.map((i) => i.message).join("; ") });
      return;
    }

    const { status, note } = parsed.data;

    try {
      // Cek record exists
      const existingResult = await db.execute(
        sql`SELECT id, status, phone, brand_name, tenant_name FROM tenant_draft_agreements WHERE id = ${id} LIMIT 1`
      );
      const row = (existingResult as { rows: Record<string, unknown>[] }).rows[0];

      if (!row) {
        res.status(404).json({ error: "Calon tenant tidak ditemukan" });
        return;
      }

      // Jangan proses ulang jika sudah disetujui/ditolak
      if (row.status !== "pending") {
        res.status(409).json({
          error: "Status sudah diproses sebelumnya, tidak dapat diubah lagi",
          currentStatus: row.status,
        });
        return;
      }

      // Ambil nama admin dari session
      const user = req.user as { name?: string; email?: string; dbId?: unknown } | undefined;
      const adminName = user?.name ?? user?.email ?? "Admin";

      // Update status di database
      await db.execute(sql`
        UPDATE tenant_draft_agreements SET
          status          = ${status},
          responded_at    = NOW(),
          responded_name  = ${adminName},
          rejection_reason = ${status === "rejected" ? (note ?? null) : null},
          updated_at      = NOW()
        WHERE id = ${id}
      `);

      // Kirim notifikasi WA ke calon tenant (fire-and-forget tapi tunggu hasilnya untuk response)
      let waSent = false;
      const phone = row.phone as string | null;
      const brandName = (row.brand_name as string | null) ?? (row.tenant_name as string | null) ?? undefined;

      if (phone) {
        const calonCompanyName = await getSiteCompanyName(req.siteId).catch(() => undefined);
        const waResult = status === "approved"
          ? await sendCalonTenantApproved(phone, brandName ?? undefined, calonCompanyName)
          : await sendCalonTenantRejected(phone, brandName ?? undefined, calonCompanyName);
        waSent = waResult.ok && !waResult.skipped;
      }

      // Audit log (fire-and-forget)
      logAudit(req, {
        action: status === "approved" ? "calon_tenant_approved" : "calon_tenant_rejected",
        entityType: "tenant_draft_agreement",
        entityId: id,
        afterData: { status, note: note ?? null, waSent, adminName },
      });

      res.json({ success: true, id, status, waSent });
    } catch (err) {
      console.error("[calon-tenant] PATCH /:id/status error:", err);
      res.status(500).json({ error: "Terjadi kesalahan server saat memperbarui status" });
    }
  }
);

// ── POST /api/calon-tenant/bulk-reminder ──────────────────────────────────────
// Admin/owner — kirim WA reminder ke semua calon tenant pending dari pendaftaran mandiri
router.post(
  "/calon-tenant/bulk-reminder",
  requireAuth,
  requireAnyRole("admin", "owner"),
  async (req: Request, res: Response) => {
    try {
      // Ambil semua pending self-register dengan nomor HP valid
      const result = await db.execute(sql`
        SELECT id, brand_name, tenant_name, phone
        FROM tenant_draft_agreements
        WHERE status = 'pending'
          AND source = 'self_register'
          AND phone IS NOT NULL
          AND phone != ''
        ORDER BY created_at ASC
      `);
      const rows = (result as { rows: Record<string, unknown>[] }).rows;

      if (rows.length === 0) {
        logAudit(req, {
          action: "calon_tenant_bulk_reminder",
          entityType: "tenant_draft_agreement",
          afterData: { total: 0, sent: 0, failed: 0 },
        });
        res.json({ success: true, total: 0, sent: 0, failed: 0, results: [] });
        return;
      }

      const results: { id: number; brandName: string; phone: string; ok: boolean; error?: string }[] = [];
      let sent = 0;
      let failed = 0;

      for (const row of rows) {
        const id = row.id as number;
        const phone = row.phone as string;
        const brandName = (row.brand_name as string | null) ?? (row.tenant_name as string | null) ?? undefined;

        try {
          const reminderCompanyName = await getSiteCompanyName(req.siteId).catch(() => undefined);
          const waResult = await sendCalonTenantReminder(phone, brandName, reminderCompanyName);
          if (waResult.ok) {
            sent++;
            results.push({ id, brandName: brandName ?? phone, phone, ok: true });
          } else {
            failed++;
            results.push({ id, brandName: brandName ?? phone, phone, ok: false, error: waResult.error });
          }
        } catch (err) {
          failed++;
          results.push({
            id,
            brandName: brandName ?? phone,
            phone,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }

        // Delay 400ms antar pesan agar tidak dianggap spam
        if (rows.indexOf(row) < rows.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 400));
        }
      }

      // Audit log
      logAudit(req, {
        action: "calon_tenant_bulk_reminder",
        entityType: "tenant_draft_agreement",
        afterData: { total: rows.length, sent, failed },
      });

      res.json({ success: true, total: rows.length, sent, failed, results });
    } catch (err) {
      console.error("[calon-tenant] POST /bulk-reminder error:", err);
      res.status(500).json({ error: "Terjadi kesalahan server saat mengirim bulk reminder" });
    }
  }
);

// ── POST /api/calon-tenant/kirim-link-wa ──────────────────────────────────────
router.post(
  "/calon-tenant/kirim-link-wa",
  requireAuth,
  requireAnyRole("admin", "owner"),
  async (req: Request, res: Response) => {
    const schema = z.object({
      phone: z.string().min(8, "Nomor WA tidak valid"),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues.map((i) => i.message).join("; ") });
      return;
    }

    const rawPhone = parsed.data.phone.replace(/\D/g, "").replace(/^0/, "62");
    const token_api = process.env["FONNTE_API_KEY"] ?? process.env["FONNTE_TOKEN"];
    if (!token_api) {
      res.status(422).json({ error: "Konfigurasi WhatsApp belum diatur. Tambahkan FONNTE_API_KEY di Secrets." });
      return;
    }

    const sentBy = (req.user as { name?: string; username?: string } | undefined)?.name
      ?? (req.user as { name?: string; username?: string } | undefined)?.username
      ?? "admin";
    const siteId = req.siteId ?? null;

    let status: "success" | "failed" = "failed";
    let errorMessage: string | null = null;

    try {
      const appUrl = process.env["APP_URL"] ?? `${req.protocol}://${req.get("host")}`;
      const registerUrl = `${appUrl}/tenant/register`;
      const message = `🏢 *Pendaftaran Calon Tenant*\n\nHalo,\n\nAnda diundang untuk mengisi formulir pendaftaran calon tenant melalui link berikut:\n\n${registerUrl}\n\nSilakan isi data dengan lengkap. Terima kasih.`;

      const r = await fetch("https://api.fonnte.com/send", {
        method: "POST",
        headers: { Authorization: token_api, "Content-Type": "application/json" },
        body: JSON.stringify({ target: rawPhone, message }),
      });
      const body = await r.json().catch(() => ({})) as Record<string, unknown>;

      if (!r.ok || body["status"] === false) {
        errorMessage = String(body["reason"] ?? body["detail"] ?? "Gagal mengirim WA");
      } else {
        status = "success";
      }
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : "Network error";
      console.error("[calon-tenant] POST /kirim-link-wa error:", err);
    }

    await db.execute(sql`
      INSERT INTO registration_link_wa_log (phone_number, status, sent_by, error_message, site_id)
      VALUES (${rawPhone}, ${status}, ${sentBy}, ${errorMessage}, ${siteId})
    `).catch((logErr) => console.error("[kirim-link-wa] gagal simpan log:", logErr));

    if (status === "success") {
      res.json({ success: true, message: `Link registrasi berhasil dikirim ke ${rawPhone}` });
    } else {
      res.status(422).json({ error: errorMessage ?? "Gagal mengirim WA" });
    }
  }
);

// ── GET /api/calon-tenant/link-wa-log ─────────────────────────────────────────
router.get(
  "/calon-tenant/link-wa-log",
  requireAuth,
  requireAnyRole("admin", "owner"),
  async (req: Request, res: Response) => {
    try {
      const result = await db.execute(sql`
        SELECT id, phone_number, sent_at, status, sent_by, error_message
        FROM registration_link_wa_log
        WHERE site_id = ${req.siteId} OR site_id IS NULL
        ORDER BY sent_at DESC
        LIMIT 30
      `);
      const rows = (result as { rows: Record<string, unknown>[] }).rows.map((r) => {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(r)) {
          out[k.replace(/_([a-z])/g, (_, c: string) => (c as string).toUpperCase())] = v;
        }
        return out;
      });
      res.json({ success: true, logs: rows });
    } catch (err) {
      console.error("[calon-tenant] GET /link-wa-log error:", err);
      res.status(500).json({ error: "Gagal memuat riwayat" });
    }
  }
);

export default router;
