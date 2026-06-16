import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { z } from "zod";
import crypto from "crypto";
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

// ── Schema validasi ────────────────────────────────────────────────────────────
const createDraftSchema = z.object({
  docType: z.enum(["surat_minat", "perjanjian_sewa"]).default("surat_minat"),
  picName: z.string().max(300).optional(),
  tenantName: z.string().min(2, "Nama calon tenant minimal 2 karakter").max(300),
  brandName: z.string().min(1, "Nama brand wajib diisi").max(300),
  businessType: z.string().min(1, "Jenis usaha wajib diisi").max(200),
  email: z.string().email("Format email tidak valid").optional().or(z.literal("")),
  phone: z.string().min(8, "Nomor telepon tidak valid").max(30),
  address: z.string().max(500).optional(),
  unitCode: z.string().max(50).optional(),
  areaName: z.string().max(200).optional(),
  interestedUnit: z.string().max(300).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  durationMonths: z.number().int().min(1).max(240).optional(),
  periodLabel: z.string().max(200).optional(),
  rentAmount: z.number().min(0).default(0),
  depositAmount: z.number().min(0).default(0),
  paymentTerms: z.string().max(2000).optional(),
  notes: z.string().max(3000).optional(),
  expiresInDays: z.number().int().min(1).max(365).optional(),
});

// kolom SELECT lengkap untuk list endpoint
const LIST_COLS = sql`
  id, token, site_id, doc_type,
  pic_name, tenant_name, brand_name, business_type, email, phone,
  unit_code, area_name, interested_unit, period_label,
  start_date, end_date, duration_months, rent_amount, deposit_amount,
  status, responded_at, responded_name, rejection_reason,
  source, expires_at, created_by, created_at, updated_at
`;

// ── GET /api/draft-agreements ─────────────────────────────────────────────────
// Admin — list semua draf; site_id=0 (self-register) selalu ikut serta
router.get("/draft-agreements", async (req: Request, res: Response) => {
  try {
    const siteId = (req as Request & { siteId?: number }).siteId;
    const status = req.query.status as string | undefined;
    const validStatus = status && ["pending", "approved", "rejected"].includes(status);

    let rows: unknown[];

    if (siteId && siteId > 0) {
      // tampilkan data site ini + self-register (site_id=0)
      if (validStatus) {
        const result = await db.execute(
          sql`SELECT ${LIST_COLS} FROM tenant_draft_agreements
              WHERE (site_id = ${siteId} OR site_id = 0) AND status = ${status}
              ORDER BY created_at DESC`
        );
        rows = (result as { rows: unknown[] }).rows;
      } else {
        const result = await db.execute(
          sql`SELECT ${LIST_COLS} FROM tenant_draft_agreements
              WHERE (site_id = ${siteId} OR site_id = 0)
              ORDER BY created_at DESC`
        );
        rows = (result as { rows: unknown[] }).rows;
      }
    } else {
      // admin tanpa site context → semua data
      if (validStatus) {
        const result = await db.execute(
          sql`SELECT ${LIST_COLS} FROM tenant_draft_agreements
              WHERE status = ${status}
              ORDER BY created_at DESC`
        );
        rows = (result as { rows: unknown[] }).rows;
      } else {
        const result = await db.execute(
          sql`SELECT ${LIST_COLS} FROM tenant_draft_agreements
              ORDER BY created_at DESC`
        );
        rows = (result as { rows: unknown[] }).rows;
      }
    }

    const baseUrl = await getBaseUrl().catch(() => undefined);
    const withLinks = (rows as Record<string, unknown>[]).map((r) => {
      const c = toCamel(r);
      return {
        ...c,
        publicUrl: baseUrl
          ? `${baseUrl}/dokumen/${c.token}`
          : `/dokumen/${c.token}`,
      };
    });

    res.json(withLinks);
  } catch (err) {
    console.error("[draft-agreements] GET list error:", err);
    res.status(500).json({ error: "Gagal mengambil daftar draf perjanjian" });
  }
});

// ── GET /api/draft-agreements/:id ─────────────────────────────────────────────
router.get("/draft-agreements/:id", async (req: Request, res: Response) => {
  const id = parseInt(req.params["id"] as string);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid" }); return; }

  try {
    const result = await db.execute(
      sql`SELECT * FROM tenant_draft_agreements WHERE id = ${id} LIMIT 1`
    );
    const rawRow = (result as { rows: Record<string, unknown>[] }).rows[0];
    if (!rawRow) { res.status(404).json({ error: "Draf tidak ditemukan" }); return; }
    const row = toCamel(rawRow);

    const baseUrl = await getBaseUrl().catch(() => undefined);
    res.json({
      ...row,
      publicUrl: baseUrl
        ? `${baseUrl}/dokumen/${row.token}`
        : `/dokumen/${row.token}`,
    });
  } catch (err) {
    console.error("[draft-agreements] GET :id error:", err);
    res.status(500).json({ error: "Gagal mengambil detail draf" });
  }
});

// ── POST /api/draft-agreements ────────────────────────────────────────────────
// Admin — buat draf baru
router.post("/draft-agreements", async (req: Request, res: Response) => {
  const parsed = createDraftSchema.safeParse(req.body);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    res.status(400).json({ error: msg });
    return;
  }

  const d = parsed.data;
  const token = crypto.randomBytes(20).toString("hex");
  const siteId = (req as Request & { siteId?: number }).siteId ?? 0;
  const user = (req as Request & { user?: { id: string | number; name?: string } }).user;
  const createdBy = user ? String(user.id) : null;

  const expiresAt = d.expiresInDays
    ? new Date(Date.now() + d.expiresInDays * 86_400_000).toISOString()
    : null;

  try {
    const result = await db.execute(sql`
      INSERT INTO tenant_draft_agreements (
        token, site_id, doc_type,
        pic_name, tenant_name, brand_name, business_type, email, phone, address,
        unit_code, area_name, interested_unit,
        start_date, end_date, duration_months, period_label,
        rent_amount, deposit_amount, payment_terms,
        notes, expires_at, created_by, source
      ) VALUES (
        ${token}, ${siteId}, ${d.docType},
        ${d.picName ?? null}, ${d.tenantName}, ${d.brandName}, ${d.businessType},
        ${d.email ?? null}, ${d.phone}, ${d.address ?? null},
        ${d.unitCode ?? null}, ${d.areaName ?? null}, ${d.interestedUnit ?? null},
        ${d.startDate ?? null}, ${d.endDate ?? null},
        ${d.durationMonths ?? null}, ${d.periodLabel ?? null},
        ${d.rentAmount}, ${d.depositAmount}, ${d.paymentTerms ?? null},
        ${d.notes ?? null}, ${expiresAt}, ${createdBy}, 'admin'
      )
      RETURNING *
    `);
    const rawRow = (result as { rows: Record<string, unknown>[] }).rows[0];
    const row = toCamel(rawRow);

    const baseUrl = await getBaseUrl().catch(() => undefined);
    res.status(201).json({
      ...row,
      publicUrl: baseUrl
        ? `${baseUrl}/dokumen/${token}`
        : `/dokumen/${token}`,
    });
  } catch (err) {
    console.error("[draft-agreements] POST error:", err);
    res.status(500).json({ error: "Gagal membuat draf perjanjian" });
  }
});

// ── DELETE /api/draft-agreements/:id ─────────────────────────────────────────
router.delete("/draft-agreements/:id", async (req: Request, res: Response) => {
  const id = parseInt(req.params["id"] as string);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid" }); return; }

  try {
    const result = await db.execute(
      sql`DELETE FROM tenant_draft_agreements WHERE id = ${id} RETURNING id`
    );
    const deleted = (result as { rows: unknown[] }).rows;
    if (deleted.length === 0) {
      res.status(404).json({ error: "Draf tidak ditemukan" });
      return;
    }
    res.json({ success: true, message: "Draf berhasil dihapus" });
  } catch (err) {
    console.error("[draft-agreements] DELETE error:", err);
    res.status(500).json({ error: "Gagal menghapus draf" });
  }
});

// ── POST /api/draft-agreements/:id/remind ─────────────────────────────────────
// Admin — kirim ulang link via WA ke calon tenant
router.post("/draft-agreements/:id/remind", async (req: Request, res: Response) => {
  const id = parseInt(req.params["id"] as string);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid" }); return; }

  try {
    const result = await db.execute(
      sql`SELECT * FROM tenant_draft_agreements WHERE id = ${id} LIMIT 1`
    );
    const row = (result as { rows: Record<string, unknown>[] }).rows[0];
    if (!row) { res.status(404).json({ error: "Draf tidak ditemukan" }); return; }

    if (row.status !== "pending") {
      res.status(409).json({ error: "Dokumen ini sudah direspon oleh tenant" });
      return;
    }

    const token_api = process.env.FONNTE_TOKEN;
    if (!token_api) {
      res.status(422).json({ error: "Konfigurasi WhatsApp belum diatur (FONNTE_TOKEN)" });
      return;
    }

    const baseUrl = await getBaseUrl().catch(() => undefined);
    const docUrl = baseUrl
      ? `${baseUrl}/dokumen/${row.token}`
      : `/dokumen/${row.token}`;

    const docLabel = row.doc_type === "perjanjian_sewa" ? "Perjanjian Sewa" : "Surat Minat Menyewa";
    const message = `📄 *${docLabel}*\n\nYth. ${row.tenant_name},\n\nBerikut link dokumen yang perlu Anda tinjau dan berikan persetujuan:\n\n${docUrl}\n\nSilakan buka link tersebut dan pilih *Setuju* atau *Tidak Setuju*.\n\nTerima kasih.`;

    await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: { Authorization: token_api, "Content-Type": "application/json" },
      body: JSON.stringify({ target: row.phone as string, message }),
    });

    res.json({ success: true, message: "Pengingat berhasil dikirim via WhatsApp" });
  } catch (err) {
    console.error("[draft-agreements] POST remind error:", err);
    res.status(500).json({ error: "Gagal mengirim pengingat" });
  }
});

// ── PATCH /api/draft-agreements/:id ──────────────────────────────────────────
// Admin — edit/perkaya data draf
router.patch("/draft-agreements/:id", async (req: Request, res: Response) => {
  const id = parseInt(req.params["id"] as string);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid" }); return; }

  const patchSchema = createDraftSchema.partial();
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    res.status(400).json({ error: msg });
    return;
  }

  const d = parsed.data;

  try {
    const existingResult = await db.execute(
      sql`SELECT * FROM tenant_draft_agreements WHERE id = ${id} LIMIT 1`
    );
    const old = (existingResult as { rows: Record<string, unknown>[] }).rows[0];
    if (!old) { res.status(404).json({ error: "Draf tidak ditemukan" }); return; }

    const expiresAt = d.expiresInDays
      ? new Date(Date.now() + d.expiresInDays * 86_400_000).toISOString()
      : (old.expires_at as string | null);

    const result = await db.execute(sql`
      UPDATE tenant_draft_agreements SET
        doc_type         = ${d.docType         !== undefined ? d.docType         : old.doc_type},
        pic_name         = ${d.picName         !== undefined ? (d.picName || null)         : old.pic_name},
        tenant_name      = ${d.tenantName      !== undefined ? d.tenantName      : old.tenant_name},
        brand_name       = ${d.brandName       !== undefined ? d.brandName       : old.brand_name},
        business_type    = ${d.businessType    !== undefined ? d.businessType    : old.business_type},
        email            = ${d.email           !== undefined ? (d.email || null)           : old.email},
        phone            = ${d.phone           !== undefined ? d.phone           : old.phone},
        address          = ${d.address         !== undefined ? (d.address || null)         : old.address},
        unit_code        = ${d.unitCode        !== undefined ? (d.unitCode || null)        : old.unit_code},
        area_name        = ${d.areaName        !== undefined ? (d.areaName || null)        : old.area_name},
        interested_unit  = ${d.interestedUnit  !== undefined ? (d.interestedUnit || null)  : old.interested_unit},
        start_date       = ${d.startDate       !== undefined ? (d.startDate || null)       : old.start_date},
        end_date         = ${d.endDate         !== undefined ? (d.endDate || null)         : old.end_date},
        duration_months  = ${d.durationMonths  !== undefined ? d.durationMonths  : old.duration_months},
        period_label     = ${d.periodLabel     !== undefined ? (d.periodLabel || null)     : old.period_label},
        rent_amount      = ${d.rentAmount      !== undefined ? d.rentAmount      : old.rent_amount},
        deposit_amount   = ${d.depositAmount   !== undefined ? d.depositAmount   : old.deposit_amount},
        payment_terms    = ${d.paymentTerms    !== undefined ? (d.paymentTerms || null)    : old.payment_terms},
        notes            = ${d.notes           !== undefined ? (d.notes || null)           : old.notes},
        expires_at       = ${expiresAt},
        updated_at       = NOW()
      WHERE id = ${id}
      RETURNING *
    `);

    const rawRow = (result as { rows: Record<string, unknown>[] }).rows[0];
    const row = toCamel(rawRow);
    const baseUrl = await getBaseUrl().catch(() => undefined);
    res.json({
      ...row,
      publicUrl: baseUrl ? `${baseUrl}/dokumen/${row.token}` : `/dokumen/${row.token}`,
    });
  } catch (err) {
    console.error("[draft-agreements] PATCH error:", err);
    res.status(500).json({ error: "Gagal mengupdate draf perjanjian" });
  }
});

// ── POST /api/draft-agreements/:id/jadikan-booking ────────────────────────────
// Admin — konversi draf yang disetujui menjadi tenant + booking resmi
const jadikanBookingSchema = z.object({
  startDate: z.string().min(1, "Tanggal mulai wajib diisi"),
  endDate: z.string().min(1, "Tanggal selesai wajib diisi"),
  rentAmount: z.union([z.string(), z.number()]).optional(),
  depositAmount: z.union([z.string(), z.number()]).optional(),
  unitCode: z.string().max(50).optional(),
  areaName: z.string().max(200).optional(),
  billingCycle: z.enum(["monthly", "quarterly", "yearly"]).default("monthly"),
  notes: z.string().max(1000).optional(),
});

router.post("/draft-agreements/:id/jadikan-booking", async (req: Request, res: Response) => {
  const id = parseInt(req.params["id"] as string);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid" }); return; }

  const parsed = jadikanBookingSchema.safeParse(req.body);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    res.status(400).json({ error: msg });
    return;
  }
  const d = parsed.data;

  if (d.startDate && d.endDate && d.endDate <= d.startDate) {
    res.status(400).json({ error: "Tanggal selesai tidak boleh sebelum tanggal mulai" });
    return;
  }

  try {
    // Ambil draf
    const draftResult = await db.execute(
      sql`SELECT * FROM tenant_draft_agreements WHERE id = ${id} LIMIT 1`
    );
    const draft = (draftResult as { rows: Record<string, unknown>[] }).rows[0];
    if (!draft) { res.status(404).json({ error: "Draf tidak ditemukan" }); return; }

    if (draft.booking_id) {
      res.status(409).json({
        error: "Draf ini sudah pernah dikonversi ke booking",
        bookingId: draft.booking_id,
        tenantId: draft.tenant_id,
      });
      return;
    }

    const siteId = (req as Request & { siteId?: number }).siteId ?? (draft.site_id as number) ?? 0;
    const rentAmount = d.rentAmount !== undefined && d.rentAmount !== ""
      ? String(Number(d.rentAmount))
      : String(Number(draft.rent_amount ?? 0));
    const depositAmount = d.depositAmount !== undefined && d.depositAmount !== ""
      ? String(Number(d.depositAmount))
      : String(Number(draft.deposit_amount ?? 0));
    const unitCode = d.unitCode ?? (draft.unit_code as string | null) ?? null;
    const areaName = d.areaName ?? (draft.area_name as string | null) ?? "";

    // Cari tenant existing berdasarkan nomor telepon di site yang sama
    const existingTenantResult = await db.execute(
      sql`SELECT id FROM tenants WHERE phone = ${draft.phone as string} AND site_id = ${siteId} LIMIT 1`
    );
    const existingTenant = (existingTenantResult as unknown as { rows: { id: number }[] }).rows[0];

    let tenantId: number;
    if (existingTenant) {
      tenantId = existingTenant.id;
    } else {
      // Buat tenant baru
      const tenantInsert = await db.execute(sql`
        INSERT INTO tenants (
          site_id, business_name, owner_name, phone, email,
          business_category, area_name, address, status,
          default_rent_amount
        ) VALUES (
          ${siteId},
          ${(draft.brand_name as string) || (draft.tenant_name as string)},
          ${draft.tenant_name as string},
          ${draft.phone as string},
          ${(draft.email as string | null) ?? null},
          ${(draft.business_type as string) ?? null},
          ${areaName},
          ${(draft.address as string | null) ?? null},
          'active',
          ${rentAmount}
        )
        RETURNING id
      `);
      tenantId = (tenantInsert as unknown as { rows: { id: number }[] }).rows[0].id;
    }

    // Buat booking
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
        ${(draft.area_name as string | null) ?? null},
        ${d.billingCycle},
        ${d.startDate},
        ${d.endDate},
        ${(draft.duration_months as number | null) ?? null},
        ${rentAmount},
        ${depositAmount},
        ${d.notes ?? (draft.notes as string | null) ?? null},
        'aktif',
        'active',
        'UNPAID'
      )
      RETURNING id
    `);
    const bookingId = (bookingInsert as unknown as { rows: { id: number }[] }).rows[0].id;

    // Update draf dengan referensi tenant & booking
    await db.execute(sql`
      UPDATE tenant_draft_agreements
      SET tenant_id = ${tenantId}, booking_id = ${bookingId}, updated_at = NOW()
      WHERE id = ${id}
    `);

    res.status(201).json({
      success: true,
      tenantId,
      bookingId,
      message: `Berhasil! Tenant dan booking telah dibuat.`,
    });
  } catch (err) {
    console.error("[draft-agreements] POST jadikan-booking error:", err);
    res.status(500).json({ error: "Gagal membuat tenant dan booking" });
  }
});

export default router;
