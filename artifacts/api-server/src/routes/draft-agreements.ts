import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import crypto from "crypto";
import { getBaseUrl } from "../lib/app-url";
import { requireAnyRole } from "../middlewares/auth";
import {
  sendCalonTenantApproved,
  sendBookingConfirmation,
  getSiteCompanyName,
} from "../lib/whatsapp";

const router: IRouter = Router();

// ── helper: snake_case → camelCase ────────────────────────────────────────────
function toCamel(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())] = v;
  }
  return out;
}

// ── Kolom SELECT lengkap ───────────────────────────────────────────────────────
const LIST_COLS = sql`
  id, token, site_id, doc_type,
  pic_name, tenant_name, brand_name, business_type, email, phone,
  unit_code, area_name, interested_unit, period_label,
  start_date, end_date, duration_months, rent_amount, deposit_amount,
  status, responded_at, responded_name, rejection_reason,
  source, expires_at, created_by, created_at, updated_at,
  tenant_id, booking_id
`;

const ALLOWED_SORT: Record<string, string> = {
  created_at: "created_at",
  tenant_name: "tenant_name",
  brand_name: "brand_name",
  status: "status",
  rent_amount: "rent_amount",
};

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

// ── GET /api/draft-agreements/summary ─────────────────────────────────────────
router.get("/draft-agreements/summary", async (req: Request, res: Response) => {
  try {
    const siteId = (req as Request & { siteId?: number }).siteId;

    let siteCondition: SQL;
    if (siteId && siteId > 0) {
      siteCondition = sql`WHERE (site_id = ${siteId} OR site_id = 0)`;
    } else {
      siteCondition = sql`WHERE TRUE`;
    }

    const today = new Date().toISOString().slice(0, 10);
    const monthStart = today.slice(0, 7) + "-01";

    const result = await db.execute(sql`
      SELECT
        COUNT(*)                                                    AS total,
        COUNT(*) FILTER (WHERE status = 'pending')                 AS pending,
        COUNT(*) FILTER (WHERE status = 'approved')                AS approved,
        COUNT(*) FILTER (WHERE status = 'rejected')                AS rejected,
        COUNT(*) FILTER (WHERE created_at::date = ${today}::date)  AS today,
        COUNT(*) FILTER (WHERE created_at >= ${monthStart}::date)  AS this_month,
        COUNT(*) FILTER (WHERE source = 'self_register')           AS self_register
      FROM tenant_draft_agreements
      ${siteCondition}
    `);

    const row = (result as { rows: Record<string, unknown>[] }).rows[0] ?? {};
    res.json({
      total:        Number(row["total"]        ?? 0),
      pending:      Number(row["pending"]      ?? 0),
      approved:     Number(row["approved"]     ?? 0),
      rejected:     Number(row["rejected"]     ?? 0),
      today:        Number(row["today"]        ?? 0),
      thisMonth:    Number(row["this_month"]   ?? 0),
      selfRegister: Number(row["self_register"]?? 0),
    });
  } catch (err) {
    console.error("[draft-agreements] GET summary error:", err);
    res.status(500).json({ error: "Gagal mengambil ringkasan draf perjanjian" });
  }
});

// ── GET /api/draft-agreements ─────────────────────────────────────────────────
// Mendukung pagination, filter, search, sorting
router.get("/draft-agreements", async (req: Request, res: Response) => {
  try {
    const siteId = (req as Request & { siteId?: number }).siteId;

    // — parse query params —
    const page    = Math.max(1, parseInt(String(req.query["page"]  ?? "1"),  10) || 1);
    const limit   = Math.min(100, Math.max(1, parseInt(String(req.query["limit"] ?? "20"), 10) || 20));
    const offset  = (page - 1) * limit;

    const statusQ   = req.query["status"]   as string | undefined;
    const sourceQ   = req.query["source"]   as string | undefined;
    const siteIdQ   = req.query["siteId"]   as string | undefined;
    const searchQ   = req.query["search"]   as string | undefined;
    const dateFrom  = req.query["dateFrom"] as string | undefined;
    const dateTo    = req.query["dateTo"]   as string | undefined;
    const sortByRaw = String(req.query["sortBy"]  ?? "created_at");
    const sortDir   = String(req.query["sortDir"] ?? "desc").toLowerCase() === "asc" ? "ASC" : "DESC";
    const sortCol   = ALLOWED_SORT[sortByRaw] ?? "created_at";

    // — build WHERE conditions —
    const conditions: SQL[] = [];

    // site isolation
    if (siteId && siteId > 0) {
      conditions.push(sql`(site_id = ${siteId} OR site_id = 0)`);
    } else if (siteIdQ) {
      const parsedSiteId = parseInt(siteIdQ, 10);
      if (!isNaN(parsedSiteId) && parsedSiteId > 0) {
        conditions.push(sql`(site_id = ${parsedSiteId} OR site_id = 0)`);
      }
    }

    if (statusQ && ["pending", "approved", "rejected"].includes(statusQ)) {
      conditions.push(sql`status = ${statusQ}`);
    }

    if (sourceQ && ["admin", "self_register"].includes(sourceQ)) {
      conditions.push(sql`source = ${sourceQ}`);
    }

    if (searchQ && searchQ.trim()) {
      const like = `%${searchQ.trim()}%`;
      conditions.push(sql`(
        tenant_name  ILIKE ${like} OR
        brand_name   ILIKE ${like} OR
        email        ILIKE ${like} OR
        phone        ILIKE ${like}
      )`);
    }

    if (dateFrom) {
      conditions.push(sql`created_at >= ${dateFrom}::date`);
    }

    if (dateTo) {
      conditions.push(sql`created_at < (${dateTo}::date + INTERVAL '1 day')`);
    }

    const whereClause: SQL = conditions.length > 0
      ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
      : sql`WHERE TRUE`;

    // Sort direction in raw SQL (whitelisted)
    const orderClause = sortDir === "ASC"
      ? sql`ORDER BY ${sql.raw(sortCol)} ASC NULLS LAST`
      : sql`ORDER BY ${sql.raw(sortCol)} DESC NULLS LAST`;

    // — COUNT query —
    const countResult = await db.execute(sql`
      SELECT COUNT(*)::int AS total
      FROM tenant_draft_agreements
      ${whereClause}
    `);
    const total = Number((countResult as unknown as { rows: { total: number }[] }).rows[0]?.total ?? 0);
    const totalPages = Math.max(1, Math.ceil(total / limit));

    // — DATA query —
    const dataResult = await db.execute(sql`
      SELECT ${LIST_COLS}
      FROM tenant_draft_agreements
      ${whereClause}
      ${orderClause}
      LIMIT ${limit} OFFSET ${offset}
    `);

    const baseUrl = await getBaseUrl().catch(() => undefined);
    const data = (dataResult as { rows: Record<string, unknown>[] }).rows.map((r) => {
      const c = toCamel(r);
      return {
        ...c,
        publicUrl: baseUrl
          ? `${baseUrl}/dokumen/${c["token"]}`
          : `/dokumen/${c["token"]}`,
      };
    });

    res.json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    });
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
        ? `${baseUrl}/dokumen/${row["token"]}`
        : `/dokumen/${row["token"]}`,
    });
  } catch (err) {
    console.error("[draft-agreements] GET :id error:", err);
    res.status(500).json({ error: "Gagal mengambil detail draf" });
  }
});

// ── POST /api/draft-agreements ────────────────────────────────────────────────
router.post("/draft-agreements", requireAnyRole("admin", "owner"), async (req: Request, res: Response) => {
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
router.delete("/draft-agreements/:id", requireAnyRole("admin", "owner"), async (req: Request, res: Response) => {
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

// ── POST /api/draft-agreements/:id/kirim-wa-approved ─────────────────────────
// Re-kirim notifikasi WA persetujuan ke calon tenant
router.post("/draft-agreements/:id/kirim-wa-approved", requireAnyRole("admin", "owner"), async (req: Request, res: Response) => {
  const id = parseInt(req.params["id"] as string);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid" }); return; }

  try {
    const result = await db.execute(
      sql`SELECT id, status, phone, brand_name, tenant_name, site_id FROM tenant_draft_agreements WHERE id = ${id} LIMIT 1`
    );
    const row = (result as { rows: Record<string, unknown>[] }).rows[0];
    if (!row) { res.status(404).json({ error: "Draf tidak ditemukan" }); return; }

    if (row["status"] !== "approved") {
      res.status(409).json({ error: "Hanya dapat mengirim notifikasi untuk draf yang sudah disetujui" });
      return;
    }

    const phone = row["phone"] as string | null;
    if (!phone) {
      res.status(422).json({ error: "Nomor telepon calon tenant tidak tersedia" });
      return;
    }

    const brandName = (row["brand_name"] as string | null) ?? (row["tenant_name"] as string | null) ?? undefined;
    const companyName = await getSiteCompanyName(row["site_id"] as number | null).catch(() => undefined);
    const waResult = await sendCalonTenantApproved(phone, brandName, companyName);

    if (!waResult.ok && !waResult.skipped) {
      res.status(502).json({ error: waResult.error ?? "Gagal mengirim WhatsApp" });
      return;
    }

    res.json({ success: true, waSent: !waResult.skipped, skipped: waResult.skipped ?? false });
  } catch (err) {
    console.error("[draft-agreements] POST kirim-wa-approved error:", err);
    res.status(500).json({ error: "Gagal mengirim notifikasi WhatsApp" });
  }
});

// ── POST /api/draft-agreements/:id/remind ─────────────────────────────────────
router.post("/draft-agreements/:id/remind", requireAnyRole("admin", "owner"), async (req: Request, res: Response) => {
  const id = parseInt(req.params["id"] as string);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid" }); return; }

  try {
    const result = await db.execute(
      sql`SELECT * FROM tenant_draft_agreements WHERE id = ${id} LIMIT 1`
    );
    const row = (result as { rows: Record<string, unknown>[] }).rows[0];
    if (!row) { res.status(404).json({ error: "Draf tidak ditemukan" }); return; }

    if (row["status"] !== "pending") {
      res.status(409).json({ error: "Dokumen ini sudah direspon oleh tenant" });
      return;
    }

    const token_api = process.env["FONNTE_TOKEN"];
    if (!token_api) {
      res.status(422).json({ error: "Konfigurasi WhatsApp belum diatur (FONNTE_TOKEN)" });
      return;
    }

    const baseUrl = await getBaseUrl().catch(() => undefined);
    const docUrl = baseUrl
      ? `${baseUrl}/dokumen/${row["token"]}`
      : `/dokumen/${row["token"]}`;

    const docLabel = row["doc_type"] === "perjanjian_sewa" ? "Perjanjian Sewa" : "Surat Minat Menyewa";
    const message = `📄 *${docLabel}*\n\nYth. ${row["tenant_name"]},\n\nBerikut link dokumen yang perlu Anda tinjau dan berikan persetujuan:\n\n${docUrl}\n\nSilakan buka link tersebut dan pilih *Setuju* atau *Tidak Setuju*.\n\nTerima kasih.`;

    const rawPhone = String(row["phone"] ?? "");
    const digits = rawPhone.replace(/\D/g, "");
    const target = digits.startsWith("0") ? "62" + digits.slice(1) : digits.startsWith("62") ? digits : "62" + digits;

    const fonnteRes = await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: { Authorization: token_api, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ target, message, delay: "2" }).toString(),
    });

    const fonnteData = await fonnteRes.json() as Record<string, unknown>;
    if (!fonnteRes.ok || fonnteData["status"] === false) {
      const reason = String(fonnteData["reason"] ?? fonnteData["message"] ?? "Gagal kirim WA");
      res.status(502).json({ error: reason });
      return;
    }

    res.json({ success: true, message: "Pengingat berhasil dikirim via WhatsApp" });
  } catch (err) {
    console.error("[draft-agreements] POST remind error:", err);
    res.status(500).json({ error: "Gagal mengirim pengingat" });
  }
});

// ── POST /api/draft-agreements/:id/kirim-wa-manual ────────────────────────────
// Kirim link dokumen ke nomor WA yang diinput manual (semua status)
router.post("/draft-agreements/:id/kirim-wa-manual", requireAnyRole("admin", "owner"), async (req: Request, res: Response) => {
  const id = parseInt(req.params["id"] as string);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid" }); return; }

  const { targetPhone } = req.body as { targetPhone?: string };
  if (!targetPhone || targetPhone.trim().length < 8) {
    res.status(400).json({ error: "Nomor WhatsApp tujuan tidak valid" });
    return;
  }

  try {
    const result = await db.execute(
      sql`SELECT * FROM tenant_draft_agreements WHERE id = ${id} LIMIT 1`
    );
    const row = (result as { rows: Record<string, unknown>[] }).rows[0];
    if (!row) { res.status(404).json({ error: "Draf tidak ditemukan" }); return; }

    const token_api = process.env["FONNTE_TOKEN"];
    if (!token_api) {
      res.status(422).json({ error: "Konfigurasi WhatsApp belum diatur (FONNTE_TOKEN)" });
      return;
    }

    const baseUrl = await getBaseUrl().catch(() => undefined);
    const docUrl = baseUrl
      ? `${baseUrl}/dokumen/${row["token"]}`
      : `/dokumen/${row["token"]}`;

    const docLabel = row["doc_type"] === "perjanjian_sewa" ? "Perjanjian Sewa" : "Surat Minat Menyewa";
    const recipientName = (row["brand_name"] as string | null) ?? (row["tenant_name"] as string | null) ?? "Calon Tenant";
    const message = `📄 *${docLabel}*\n\nYth. ${recipientName},\n\nBerikut link dokumen yang perlu Anda tinjau dan berikan persetujuan:\n\n${docUrl}\n\nSilakan buka link tersebut dan pilih *Setuju* atau *Tidak Setuju*.\n\nTerima kasih.`;

    const digits = targetPhone.trim().replace(/\D/g, "");
    const target = digits.startsWith("0") ? "62" + digits.slice(1) : digits.startsWith("62") ? digits : "62" + digits;

    const fonnteRes = await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: { Authorization: token_api, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ target, message, delay: "2" }).toString(),
    });

    const fonnteData = await fonnteRes.json() as Record<string, unknown>;
    if (!fonnteRes.ok || fonnteData["status"] === false) {
      const reason = String(fonnteData["reason"] ?? fonnteData["message"] ?? "Gagal kirim WA");
      res.status(502).json({ error: reason });
      return;
    }

    res.json({ success: true, message: `Link dokumen berhasil dikirim ke ${target}` });
  } catch (err) {
    console.error("[draft-agreements] POST kirim-wa-manual error:", err);
    res.status(500).json({ error: "Gagal mengirim WA" });
  }
});

// ── PATCH /api/draft-agreements/:id ──────────────────────────────────────────
router.patch("/draft-agreements/:id", requireAnyRole("admin", "owner"), async (req: Request, res: Response) => {
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
      : (old["expires_at"] as string | null);

    const result = await db.execute(sql`
      UPDATE tenant_draft_agreements SET
        doc_type         = ${d.docType         !== undefined ? d.docType         : old["doc_type"]},
        pic_name         = ${d.picName         !== undefined ? (d.picName || null)         : old["pic_name"]},
        tenant_name      = ${d.tenantName      !== undefined ? d.tenantName      : old["tenant_name"]},
        brand_name       = ${d.brandName       !== undefined ? d.brandName       : old["brand_name"]},
        business_type    = ${d.businessType    !== undefined ? d.businessType    : old["business_type"]},
        email            = ${d.email           !== undefined ? (d.email || null)           : old["email"]},
        phone            = ${d.phone           !== undefined ? d.phone           : old["phone"]},
        address          = ${d.address         !== undefined ? (d.address || null)         : old["address"]},
        unit_code        = ${d.unitCode        !== undefined ? (d.unitCode || null)        : old["unit_code"]},
        area_name        = ${d.areaName        !== undefined ? (d.areaName || null)        : old["area_name"]},
        interested_unit  = ${d.interestedUnit  !== undefined ? (d.interestedUnit || null)  : old["interested_unit"]},
        start_date       = ${d.startDate       !== undefined ? (d.startDate || null)       : old["start_date"]},
        end_date         = ${d.endDate         !== undefined ? (d.endDate || null)         : old["end_date"]},
        duration_months  = ${d.durationMonths  !== undefined ? d.durationMonths  : old["duration_months"]},
        period_label     = ${d.periodLabel     !== undefined ? (d.periodLabel || null)     : old["period_label"]},
        rent_amount      = ${d.rentAmount      !== undefined ? d.rentAmount      : old["rent_amount"]},
        deposit_amount   = ${d.depositAmount   !== undefined ? d.depositAmount   : old["deposit_amount"]},
        payment_terms    = ${d.paymentTerms    !== undefined ? (d.paymentTerms || null)    : old["payment_terms"]},
        notes            = ${d.notes           !== undefined ? (d.notes || null)           : old["notes"]},
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
      publicUrl: baseUrl ? `${baseUrl}/dokumen/${row["token"]}` : `/dokumen/${row["token"]}`,
    });
  } catch (err) {
    console.error("[draft-agreements] PATCH error:", err);
    res.status(500).json({ error: "Gagal mengupdate draf perjanjian" });
  }
});

// ── POST /api/draft-agreements/:id/jadikan-booking ────────────────────────────
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

router.post("/draft-agreements/:id/jadikan-booking", requireAnyRole("admin", "owner"), async (req: Request, res: Response) => {
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
    const draftResult = await db.execute(
      sql`SELECT * FROM tenant_draft_agreements WHERE id = ${id} LIMIT 1`
    );
    const draft = (draftResult as { rows: Record<string, unknown>[] }).rows[0];
    if (!draft) { res.status(404).json({ error: "Draf tidak ditemukan" }); return; }

    if (draft["booking_id"]) {
      res.status(409).json({
        error: "Draf ini sudah pernah dikonversi ke booking",
        bookingId: draft["booking_id"],
        tenantId: draft["tenant_id"],
      });
      return;
    }

    const siteId = (req as Request & { siteId?: number }).siteId ?? (draft["site_id"] as number) ?? 0;
    const rentAmount = d.rentAmount !== undefined && d.rentAmount !== ""
      ? String(Number(d.rentAmount))
      : String(Number(draft["rent_amount"] ?? 0));
    const depositAmount = d.depositAmount !== undefined && d.depositAmount !== ""
      ? String(Number(d.depositAmount))
      : String(Number(draft["deposit_amount"] ?? 0));
    const unitCode = d.unitCode ?? (draft["unit_code"] as string | null) ?? null;
    const areaName = d.areaName ?? (draft["area_name"] as string | null) ?? "";

    const existingTenantResult = await db.execute(
      sql`SELECT id FROM tenants WHERE phone = ${draft["phone"] as string} AND site_id = ${siteId} LIMIT 1`
    );
    const existingTenant = (existingTenantResult as unknown as { rows: { id: number }[] }).rows[0];

    let tenantId: number;
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
          ${(draft["brand_name"] as string) || (draft["tenant_name"] as string)},
          ${draft["tenant_name"] as string},
          ${draft["phone"] as string},
          ${(draft["email"] as string | null) ?? null},
          ${(draft["business_type"] as string) ?? null},
          ${areaName},
          ${(draft["address"] as string | null) ?? null},
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
        ${(draft["area_name"] as string | null) ?? null},
        ${d.billingCycle},
        ${d.startDate},
        ${d.endDate},
        ${(draft["duration_months"] as number | null) ?? null},
        ${rentAmount},
        ${depositAmount},
        ${d.notes ?? (draft["notes"] as string | null) ?? null},
        'aktif',
        'active',
        'UNPAID'
      )
      RETURNING id
    `);
    const bookingId = (bookingInsert as unknown as { rows: { id: number }[] }).rows[0].id;

    await db.execute(sql`
      UPDATE tenant_draft_agreements
      SET tenant_id = ${tenantId}, booking_id = ${bookingId}, updated_at = NOW()
      WHERE id = ${id}
    `);

    // ── Kirim WA notifikasi booking ke calon tenant (fire-and-forget) ──────────
    void (async () => {
      try {
        const phone = draft["phone"] as string | null;
        if (!phone) return;
        const companyName = await getSiteCompanyName(siteId).catch(() => undefined);
        await sendBookingConfirmation({
          ownerName: (draft["tenant_name"] as string) ?? "",
          businessName: (draft["brand_name"] as string) || (draft["tenant_name"] as string) || "",
          orderNumber: orderNumber,
          unitCode: unitCode ?? (d.areaName ?? "—"),
          floor: areaName || null,
          startDate: d.startDate,
          endDate: d.endDate,
          durationMonths: (draft["duration_months"] as number | null) ?? null,
          rentAmount: rentAmount,
          phone,
          companyName,
        });
      } catch { /* tidak perlu throw */ }
    })();

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
