import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { getBaseUrl } from "../lib/app-url";
import { createAllInvoicesForBooking } from "../lib/auto-invoice";

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

    // ── Auto-create Tenant + Booking saat tenant setuju ──────────────────────
    void (async () => {
      try {
        // Refresh draft karena baru saja di-update
        const freshDraft = await getDraftByToken(token);
        if (!freshDraft || freshDraft.bookingId) return; // sudah ada booking, skip

        const siteId = (freshDraft.siteId as number | null) ?? 0;
        const phone = (freshDraft.phone as string | null)
          ?? (respondedPhone ? respondedPhone.replace(/\D/g, "").replace(/^0/, "62") : null);
        const brandName = (freshDraft.brandName as string | null) ?? (freshDraft.tenantName as string | null);
        const tenantName = (freshDraft.tenantName as string | null) ?? respondedName;
        const rentAmount = String(Number(freshDraft.rentAmount ?? 0));
        const depositAmount = String(Number(freshDraft.depositAmount ?? 0));
        const unitCode = (freshDraft.unitCode as string | null) ?? null;
        const areaName = (freshDraft.areaName as string | null) ?? "";
        const durationMonths = (freshDraft.durationMonths as number | null) ?? 12;

        const today = new Date();
        const defaultStart = today.toISOString().split("T")[0]!;
        const endDateObj = new Date(today);
        endDateObj.setMonth(endDateObj.getMonth() + durationMonths);
        const startDate = (freshDraft.startDate as string | null) ?? defaultStart;
        const endDateFinal = (freshDraft.endDate as string | null) ?? endDateObj.toISOString().split("T")[0];

        // Cek apakah tenant sudah ada (by phone + site)
        let tenantId: number | null = null;
        if (phone) {
          const existingResult = await db.execute(
            sql`SELECT id FROM tenants WHERE phone = ${phone} AND site_id = ${siteId} LIMIT 1`
          );
          const existing = (existingResult as unknown as { rows: { id: number }[] }).rows[0];
          if (existing) {
            tenantId = existing.id;
          }
        }

        if (!tenantId) {
          const insertResult = await db.execute(sql`
            INSERT INTO tenants (
              site_id, business_name, owner_name, phone, email,
              business_category, area_name, address, status, default_rent_amount
            ) VALUES (
              ${siteId},
              ${brandName ?? tenantName},
              ${tenantName},
              ${phone ?? null},
              ${(freshDraft.email as string | null) ?? null},
              ${(freshDraft.businessType as string | null) ?? null},
              ${areaName},
              ${(freshDraft.address as string | null) ?? null},
              'active',
              ${rentAmount}
            )
            RETURNING id
          `);
          tenantId = (insertResult as unknown as { rows: { id: number }[] }).rows[0]?.id ?? null;
        }

        if (!tenantId) return;

        const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}`;
        const bookingResult = await db.execute(sql`
          INSERT INTO tenant_bookings (
            site_id, tenant_id, order_number,
            unit_code, floor, billing_cycle,
            start_date, end_date, duration_months,
            rent_amount, deposit_amount,
            notes, booking_status, contract_status, payment_status
          ) VALUES (
            ${siteId},
            ${tenantId},
            ${orderNumber},
            ${unitCode},
            ${areaName || null},
            'monthly',
            ${startDate},
            ${endDateFinal},
            ${durationMonths},
            ${rentAmount},
            ${depositAmount},
            ${(freshDraft.notes as string | null) ?? null},
            'aktif',
            'active',
            'UNPAID'
          )
          RETURNING id
        `);
        const bookingId = (bookingResult as unknown as { rows: { id: number }[] }).rows[0]?.id ?? null;
        if (!bookingId) return;

        // Update draft dengan tenant_id dan booking_id
        await db.execute(sql`
          UPDATE tenant_draft_agreements
          SET tenant_id = ${tenantId}, booking_id = ${bookingId}, updated_at = NOW()
          WHERE token = ${token}
        `);

        // Auto-buat invoice seluruh periode (fire-and-forget)
        void createAllInvoicesForBooking({
          bookingId,
          siteId,
          tenantId,
          unitCode,
          rentAmount: Number(rentAmount),
          startDate,
          durationMonths,
        }).catch((err) => console.error("[draft-public] Auto-invoice error:", err));

        console.log(`[draft-public] Auto-booking created: bookingId=${bookingId} tenantId=${tenantId} for draft token=${token}`);
      } catch (err) {
        console.error("[draft-public] Auto-booking error (non-fatal):", err);
      }
    })();

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
      message: "Terima kasih! Persetujuan Anda telah kami catat. Booking tenant Anda sudah otomatis dibuat.",
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

// ── GET /api/public/available-units ──────────────────────────────────────────
// Public — daftar unit yang masih tersedia (belum ada penyewa aktif)
router.get("/public/available-units", async (req: Request, res: Response) => {
  try {
    const siteIdParam = req.query["site_id"];
    const siteId = siteIdParam ? Number(siteIdParam) : null;

    const today = new Date().toISOString().slice(0, 10);

    const baseCondition = sql`
      mu.status != 'maintenance'
      AND NOT EXISTS (
        SELECT 1 FROM tenant_bookings tb
        WHERE tb.unit_code = mu.unit_code
          AND tb.site_id = mu.site_id
          AND tb.contract_status NOT IN ('terminated', 'expired')
          AND tb.booking_status IN ('aktif', 'active')
          AND (tb.end_date IS NULL OR tb.end_date >= ${today})
      )
    `;

    const rows = siteId
      ? (await db.execute(sql`
          SELECT
            mu.id, mu.unit_code, mu.floor, mu.zone, mu.area_kantin,
            mu.size_m2, mu.default_rent_amount, mu.unit_type, mu.site_id,
            ms.name AS site_name, ms.code AS site_code
          FROM mall_units mu
          LEFT JOIN mall_sites ms ON ms.id = mu.site_id
          WHERE ${baseCondition} AND mu.site_id = ${siteId}
          ORDER BY mu.unit_code
        `) as { rows: Record<string, unknown>[] }).rows
      : (await db.execute(sql`
          SELECT
            mu.id, mu.unit_code, mu.floor, mu.zone, mu.area_kantin,
            mu.size_m2, mu.default_rent_amount, mu.unit_type, mu.site_id,
            ms.name AS site_name, ms.code AS site_code
          FROM mall_units mu
          LEFT JOIN mall_sites ms ON ms.id = mu.site_id
          WHERE ${baseCondition}
          ORDER BY mu.site_id, mu.unit_code
        `) as { rows: Record<string, unknown>[] }).rows;

    res.json(rows.map(toCamel));
  } catch (err) {
    console.error("[public] GET /available-units error:", err);
    res.status(500).json({ error: "Gagal mengambil data unit tersedia" });
  }
});

export default router;
