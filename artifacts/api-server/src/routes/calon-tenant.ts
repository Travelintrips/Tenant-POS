import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { z } from "zod";
import crypto from "crypto";
import { registrationRateLimiter } from "../middlewares/rate-limit";
import { requireAuth, requireAnyRole } from "../middlewares/auth";
import { sendCalonTenantApproved, sendCalonTenantRejected, sendCalonTenantReminder, sendCalonTenantUnitAvailable, getSiteCompanyName, sendBookingConfirmation } from "../lib/whatsapp";
import { logAudit } from "../lib/audit";
import { blastSessionLogsTable } from "@workspace/db/schema";
import { createInitialInvoiceForBooking } from "../lib/auto-invoice";

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
  agreementStatus: z.enum(["setuju", "tidak_setuju"], { required_error: "Persetujuan ketentuan sewa wajib dipilih" }),
  disagreementReason: z.string().max(2000).optional(),
  leaseDurationMonths: z.coerce.number().int().min(1).max(120).optional(),
}).superRefine((data, ctx) => {
  if (data.agreementStatus === "tidak_setuju") {
    if (!data.disagreementReason || data.disagreementReason.trim().length < 10) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Alasan tidak setuju minimal 10 karakter", path: ["disagreementReason"] });
    }
  }
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
        notes, source, ip_address, status,
        agreement_status, disagreement_reason, lease_duration_months
      ) VALUES (
        ${token}, 0, 'surat_minat',
        ${d.picName}, ${d.picName}, ${d.brandName}, ${d.businessType},
        ${d.email || null}, ${d.phone}, ${d.address || null}, ${d.interestedUnit || null},
        ${d.notes || null}, 'self_register', ${ip}, 'pending',
        ${d.agreementStatus},
        ${d.agreementStatus === "tidak_setuju" ? (d.disagreementReason ?? null) : null},
        ${d.leaseDurationMonths ?? null}
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
      // Cek record exists — ambil semua field yang dibutuhkan untuk auto-booking
      const existingResult = await db.execute(
        sql`SELECT * FROM tenant_draft_agreements WHERE id = ${id} LIMIT 1`
      );
      const row = (existingResult as { rows: Record<string, unknown>[] }).rows[0];

      if (!row) {
        res.status(404).json({ error: "Calon tenant tidak ditemukan" });
        return;
      }

      // Blokir jika sudah ditolak, atau sudah punya booking (sudah dikonversi)
      if (row["status"] === "rejected") {
        res.status(409).json({
          error: "Draf ini sudah ditolak, tidak dapat disetujui",
          currentStatus: row["status"],
        });
        return;
      }
      if (row["booking_id"]) {
        res.status(409).json({
          error: "Draf ini sudah dikonversi ke booking",
          bookingId: row["booking_id"],
          currentStatus: row["status"],
        });
        return;
      }
      // status 'pending' (belum direspon) atau 'approved' (tenant sudah tanda tangan)
      // sama-sama boleh diproses admin

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
      // Skip WA jika draft sudah 'approved' sebelumnya (tenant sudah tahu, hanya buat booking)
      let waSent = false;
      const phone = row["phone"] as string | null;
      const brandName = (row["brand_name"] as string | null) ?? (row["tenant_name"] as string | null) ?? undefined;
      const siteId = (req as Request & { siteId?: number }).siteId ?? (row["site_id"] as number) ?? 0;
      const alreadyApproved = row["status"] === "approved";

      if (phone && !alreadyApproved) {
        const calonCompanyName = await getSiteCompanyName(siteId).catch(() => undefined);
        const waResult = status === "approved"
          ? await sendCalonTenantApproved(phone, brandName ?? undefined, calonCompanyName)
          : await sendCalonTenantRejected(phone, brandName ?? undefined, calonCompanyName);
        waSent = waResult.ok && !waResult.skipped;
      }

      // ── Auto-create Tenant + Booking saat disetujui ───────────────────────────
      let tenantId: number | null = null;
      let bookingId: number | null = null;

      if (status === "approved" && !row["booking_id"]) {
        try {
          const rentAmount = String(Number(row["rent_amount"] ?? 0));
          const depositAmount = String(Number(row["deposit_amount"] ?? 0));
          const unitCode = (row["unit_code"] as string | null) ?? null;
          const areaName = (row["area_name"] as string | null) ?? "";
          const durationMonths = (row["duration_months"] as number | null) ?? 12;

          // Default tanggal: hari ini s/d selesai berdasarkan durasi
          const today = new Date();
          const defaultStart = today.toISOString().split("T")[0];
          const endDate = new Date(today);
          endDate.setMonth(endDate.getMonth() + durationMonths);
          const defaultEnd = endDate.toISOString().split("T")[0];

          const startDate = (row["start_date"] as string | null) ?? defaultStart;
          const endDateFinal = (row["end_date"] as string | null) ?? defaultEnd;

          // Cek tenant sudah ada berdasarkan nomor HP
          const existingTenantResult = await db.execute(
            sql`SELECT id FROM tenants WHERE phone = ${phone} AND site_id = ${siteId} LIMIT 1`
          );
          const existingTenant = (existingTenantResult as unknown as { rows: { id: number }[] }).rows[0];

          if (existingTenant) {
            tenantId = existingTenant.id;
          } else {
            const tenantInsert = await db.execute(sql`
              INSERT INTO tenants (
                site_id, business_name, owner_name, phone, email,
                business_category, area_name, address, status,
                default_rent_amount
              ) VALUES (
                ${siteId},
                ${(row["brand_name"] as string) || (row["tenant_name"] as string)},
                ${row["tenant_name"] as string},
                ${phone},
                ${(row["email"] as string | null) ?? null},
                ${(row["business_type"] as string | null) ?? null},
                ${areaName},
                ${(row["address"] as string | null) ?? null},
                'active',
                ${rentAmount}
              )
              RETURNING id
            `);
            tenantId = (tenantInsert as unknown as { rows: { id: number }[] }).rows[0].id;
          }

          const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}`;
          const bookingInsert = await db.execute(sql`
            INSERT INTO tenant_bookings (
              site_id, tenant_id, order_number,
              unit_code, floor, billing_cycle,
              start_date, end_date,
              duration_months,
              rent_amount, deposit_amount,
              notes, booking_status, contract_status,
              payment_status
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
              ${(row["notes"] as string | null) ?? null},
              'aktif',
              'active',
              'UNPAID'
            )
            RETURNING id
          `);
          bookingId = (bookingInsert as unknown as { rows: { id: number }[] }).rows[0].id;

          // Update draft dengan tenant_id dan booking_id
          await db.execute(sql`
            UPDATE tenant_draft_agreements
            SET tenant_id = ${tenantId}, booking_id = ${bookingId}, updated_at = NOW()
            WHERE id = ${id}
          `);

          // Auto-buat invoice pertama (fire-and-forget)
          void createInitialInvoiceForBooking({
            bookingId,
            siteId,
            tenantId,
            unitCode,
            rentAmount: Number(rentAmount),
            billingCycle: "monthly",
          }).catch((err) => console.error("[calon-tenant] Auto-invoice error:", err));

          // Kirim WA konfirmasi booking (fire-and-forget)
          void (async () => {
            try {
              if (!phone) return;
              const companyName = await getSiteCompanyName(siteId).catch(() => undefined);
              await sendBookingConfirmation({
                ownerName: (row["tenant_name"] as string) ?? "",
                businessName: brandName ?? "",
                orderNumber,
                unitCode: unitCode ?? areaName ?? "—",
                floor: areaName || null,
                startDate,
                endDate: endDateFinal,
                durationMonths,
                rentAmount,
                phone,
                companyName,
              });
            } catch { /* tidak perlu throw */ }
          })();

        } catch (bookingErr) {
          console.error("[calon-tenant] Auto-booking error (non-fatal):", bookingErr);
          // Gagal buat booking tidak menggagalkan approval
        }
      }

      // Audit log (fire-and-forget)
      logAudit(req, {
        action: status === "approved" ? "calon_tenant_approved" : "calon_tenant_rejected",
        entityType: "tenant_draft_agreement",
        entityId: id,
        afterData: { status, note: note ?? null, waSent, adminName, tenantId, bookingId },
      });

      res.json({ success: true, id, status, waSent, tenantId, bookingId });
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

      const fonnteBody = new URLSearchParams({ target: rawPhone, message, delay: "2" });
      const r = await fetch("https://api.fonnte.com/send", {
        method: "POST",
        headers: { Authorization: token_api, "Content-Type": "application/x-www-form-urlencoded" },
        body: fonnteBody.toString(),
      });
      const body = await r.json().catch(() => ({})) as Record<string, unknown>;

      const fonnteLog = `Fonnte: ${JSON.stringify(body)}`;
      console.log("[kirim-link-wa] Fonnte response:", fonnteLog);

      const statusFailed = body["status"] === false || body["status"] === "false";
      const processFailed = body["process"] === false || body["process"] === "false";
      if (!r.ok || statusFailed || processFailed) {
        errorMessage = `${String(body["reason"] ?? body["detail"] ?? body["message"] ?? "Gagal mengirim WA")} | ${fonnteLog}`;
        console.error("[kirim-link-wa] Fonnte error:", errorMessage);
      } else {
        // Simpan detail respon Fonnte meski sukses (untuk debug)
        errorMessage = fonnteLog;
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

// ── POST /api/calon-tenant/blast-unit-tersedia ────────────────────────────────
// Kirim notifikasi WA ke semua calon tenant (status pending/approved-no-booking)
// yang unit minatnya cocok dengan unit yang kini kosong.
// Body opsional: { unitCodes: string[] } — jika kosong, kirim ke SEMUA pending calon tenant
// dengan daftar semua unit kosong saat ini.
router.post(
  "/calon-tenant/blast-unit-tersedia",
  requireAuth,
  requireAnyRole("admin", "owner"),
  async (req: Request, res: Response) => {
    const siteId = (req as Request & { siteId?: number }).siteId ?? 0;

    try {
      // Ambil semua unit yang kosong (tidak ada booking aktif)
      const unitResult = await db.execute(sql`
        SELECT mu.unit_code
        FROM mall_units mu
        WHERE (${siteId} = 0 OR mu.site_id = ${siteId})
          AND NOT EXISTS (
            SELECT 1 FROM tenant_bookings tb
            WHERE tb.unit_code = mu.unit_code
              AND (${siteId} = 0 OR tb.site_id = ${siteId})
              AND tb.booking_status IN ('aktif','active')
              AND (tb.contract_status IS NULL OR tb.contract_status NOT IN ('terminated','expired','cancelled'))
          )
        ORDER BY mu.unit_code
      `);
      const availableUnitCodes = (unitResult as unknown as { rows: { unit_code: string }[] }).rows
        .map((r) => r.unit_code)
        .filter(Boolean);

      if (availableUnitCodes.length === 0) {
        res.json({ success: true, total: 0, sent: 0, failed: 0, skipped: 0, message: "Tidak ada unit kosong saat ini" });
        return;
      }

      // Filter dari body jika admin memilih unit tertentu
      const bodyUnitCodes = Array.isArray(req.body?.unitCodes) ? (req.body.unitCodes as string[]) : [];
      const targetUnitCodes = bodyUnitCodes.length > 0
        ? availableUnitCodes.filter((u) => bodyUnitCodes.includes(u))
        : availableUnitCodes;

      if (targetUnitCodes.length === 0) {
        res.json({ success: true, total: 0, sent: 0, failed: 0, skipped: 0, message: "Unit yang dipilih tidak tersedia saat ini" });
        return;
      }

      // Ambil semua calon tenant yang pending / approved tapi belum punya booking
      // Prioritaskan yang unit minatnya cocok, tapi juga kirim ke yang tidak cantumkan unit
      const calonResult = await db.execute(sql`
        SELECT id, pic_name, brand_name, phone, interested_unit, site_id
        FROM tenant_draft_agreements
        WHERE status IN ('pending', 'approved')
          AND booking_id IS NULL
          AND phone IS NOT NULL
          AND TRIM(phone) <> ''
          AND (${siteId} = 0 OR site_id = ${siteId} OR site_id = 0)
        ORDER BY created_at ASC
      `);
      const calonList = (calonResult as { rows: Record<string, unknown>[] }).rows;

      if (calonList.length === 0) {
        res.json({ success: true, total: 0, sent: 0, failed: 0, skipped: 0, message: "Tidak ada calon tenant pending" });
        return;
      }

      const companyName = await getSiteCompanyName(siteId).catch(() => undefined);
      const sentBy = (req.user as { email?: string } | undefined)?.email ?? "admin";

      let sent = 0, failed = 0, skipped = 0;
      const results: Array<{ id: number; phone: string; status: string; error?: string }> = [];

      for (const calon of calonList) {
        const phone = calon["phone"] as string;
        const picName = (calon["brand_name"] as string | null) ?? (calon["pic_name"] as string | null) ?? undefined;
        const interestedUnit = (calon["interested_unit"] as string | null)?.trim();

        // Tentukan unit yang relevan untuk calon ini
        let relevantUnits: string[];
        if (interestedUnit && interestedUnit.length > 0) {
          // Cek apakah unit minatnya ada di daftar yang tersedia
          const matchedUnit = targetUnitCodes.find(
            (u) => u.toLowerCase() === interestedUnit.toLowerCase()
          );
          if (matchedUnit) {
            relevantUnits = [matchedUnit];
          } else {
            // Unit minat tidak tersedia — skip (unit yang dia minta masih terisi atau tidak cocok)
            skipped++;
            results.push({ id: calon["id"] as number, phone, status: "skipped_unit_not_available" });
            continue;
          }
        } else {
          // Tidak cantumkan unit → kirim semua unit tersedia
          relevantUnits = targetUnitCodes;
        }

        await new Promise((r) => setTimeout(r, 400)); // delay anti-spam
        const waResult = await sendCalonTenantUnitAvailable(phone, picName, relevantUnits, companyName)
          .catch((err: Error) => ({ ok: false, error: err.message }));

        if (waResult.ok && !(waResult as { skipped?: boolean }).skipped) {
          sent++;
          results.push({ id: calon["id"] as number, phone, status: "sent" });
        } else if ((waResult as { skipped?: boolean }).skipped) {
          skipped++;
          results.push({ id: calon["id"] as number, phone, status: "skipped_no_token" });
        } else {
          failed++;
          results.push({ id: calon["id"] as number, phone, status: "failed", error: waResult.error });
        }

        // Simpan ke wa_send_logs
        await db.execute(sql`
          INSERT INTO wa_send_logs (site_id, phone, message_type, status, error_message, sent_by)
          VALUES (${siteId || null}, ${phone}, 'unit_available_blast', ${results.at(-1)!.status}, ${results.at(-1)!.error ?? null}, ${sentBy})
        `).catch(() => {});
      }

      // Simpan ringkasan sesi blast
      await db.insert(blastSessionLogsTable).values({
        siteId: siteId || null,
        blastType: "unit_tersedia",
        sentBy,
        total: calonList.length,
        sent,
        failed,
        skipped,
        metadata: JSON.stringify({ unitCodes: targetUnitCodes }),
      }).catch(() => {});

      logAudit(req, {
        action: "blast_unit_tersedia_wa",
        entityType: "calon_tenant",
        entityId: 0,
        afterData: { unitCodes: targetUnitCodes, sent, failed, skipped, total: calonList.length },
      });

      res.json({
        success: true,
        total: calonList.length,
        sent,
        failed,
        skipped,
        availableUnits: targetUnitCodes,
        results,
      });
    } catch (err) {
      console.error("[calon-tenant] POST /blast-unit-tersedia error:", err);
      res.status(500).json({ error: "Gagal menjalankan blast notifikasi" });
    }
  }
);

// ── GET /api/calon-tenant/blast-history ───────────────────────────────────────
// Riwayat sesi blast notifikasi unit tersedia
router.get(
  "/calon-tenant/blast-history",
  requireAuth,
  requireAnyRole("admin", "owner"),
  async (req: Request, res: Response) => {
    const siteId = (req as Request & { siteId?: number }).siteId ?? 0;
    try {
      const result = await db.execute(sql`
        SELECT id, site_id, blast_type, sent_by, total, sent, failed, skipped, metadata, created_at
        FROM blast_session_logs
        WHERE (${siteId} = 0 OR site_id = ${siteId} OR site_id IS NULL)
          AND blast_type = 'unit_tersedia'
        ORDER BY created_at DESC
        LIMIT 50
      `);
      const rows = ((result as unknown as { rows?: unknown[] }).rows ?? (result as unknown as unknown[])).map((r: unknown) => {
        const row = r as Record<string, unknown>;
        return {
          id: row["id"],
          siteId: row["site_id"],
          blastType: row["blast_type"],
          sentBy: row["sent_by"],
          total: row["total"],
          sent: row["sent"],
          failed: row["failed"],
          skipped: row["skipped"],
          metadata: row["metadata"] ? (() => { try { return JSON.parse(row["metadata"] as string); } catch { return null; } })() : null,
          createdAt: row["created_at"],
        };
      });
      res.json({ success: true, logs: rows });
    } catch (err) {
      console.error("[calon-tenant] GET /blast-history error:", err);
      res.status(500).json({ error: "Gagal memuat riwayat blast" });
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
      const sid = req.siteId && req.siteId > 0 ? req.siteId : null;
      const result = sid
        ? await db.execute(sql`
            SELECT id, phone_number, sent_at, status, sent_by, error_message
            FROM registration_link_wa_log
            WHERE site_id = ${sid} OR site_id IS NULL
            ORDER BY sent_at DESC LIMIT 30`)
        : await db.execute(sql`
            SELECT id, phone_number, sent_at, status, sent_by, error_message
            FROM registration_link_wa_log
            ORDER BY sent_at DESC LIMIT 30`);
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
