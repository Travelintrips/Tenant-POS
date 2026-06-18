import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sseBroker } from "../lib/sse-broker";
import {
  tenantInvoicesTable,
  tenantBookingsTable,
  tenantsTable,
  tenantPaymentsTable,
} from "@workspace/db/schema";
import { eq, and, sql, desc, ilike, or, lte, gte, notInArray } from "drizzle-orm";
import { z } from "zod";
import { requireAnyRole } from "../middlewares/auth";
import { logAudit } from "../lib/audit";
import { getBaseUrl } from "../lib/app-url";
import { writePaymentEvent, normalizePaymentMethod } from "../lib/payment-events";

const router: IRouter = Router();
router.use("/tenant-invoices", requireAnyRole("owner", "admin", "finance"));

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Generate invoice number format: INV-TENANT/YYYYMM/NNNNN
 *
 * Menggunakan MAX sequence (bukan COUNT) agar tidak bentrok ketika ada gap
 * (invoice dihapus) atau pemanggilan bersamaan. Caller yang melakukan INSERT
 * harus menangkap unique constraint violation (code "23505") dan memanggil
 * ulang fungsi ini sekali lagi — lihat insertInvoiceSafe().
 */
async function generateInvoiceNumber(): Promise<string> {
  const now = new Date();
  const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prefix = `INV-TENANT/${yyyymm}/`;

  // Gunakan SUBSTR(str, pos) — sintaks posisional eksplisit.
  // SUBSTRING(str FROM n) di PostgreSQL diinterpretasikan sebagai regex extraction,
  // bukan positional, sehingga selalu NULL jika n berupa angka yang tidak cocok sebagai regex.
  const prefixLen = prefix.length;
  const [row] = await db
    .select({
      maxSeq: sql<number | null>`COALESCE(MAX(CAST(SUBSTR(invoice_number, ${prefixLen + 1}) AS INTEGER)), 0)`,
    })
    .from(tenantInvoicesTable)
    .where(
      sql`invoice_number LIKE ${prefix + "%"} AND LENGTH(invoice_number) = ${prefixLen + 5}`,
    );

  const next = (row?.maxSeq ?? 0) + 1;
  return `${prefix}${next.toString().padStart(5, "0")}`;
}

/**
 * INSERT invoice dengan retry otomatis jika invoice_number duplicate
 * (unique constraint violation PostgreSQL = SQLSTATE 23505).
 * Menghindari 500 akibat race condition pada generateInvoiceNumber.
 */
async function insertInvoiceSafe(
  values: Parameters<typeof db.insert>[0] extends infer T ? (T extends any ? any : never) : never,
  maxRetries = 3,
): Promise<typeof tenantInvoicesTable.$inferSelect> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const invoiceNumber = await generateInvoiceNumber();

    try {
      const [inserted] = await db
        .insert(tenantInvoicesTable)
        .values({ ...values, invoiceNumber })
        .returning();
      return inserted;
    } catch (err) {
      // DrizzleQueryError membungkus PG error asli di .cause — periksa keduanya
      const code =
        (err as any)?.code ??
        (err as any)?.cause?.code ??
        (err as any)?.cause?.routine;
      const isUniqueViolation = code === "23505" || (err as any)?.cause?.code === "23505";
      if (isUniqueViolation && attempt < maxRetries) {
        // Coba lagi dengan sequence berikutnya
        continue;
      }
      throw err;
    }
  }
  throw new Error(`Gagal generate invoice number setelah ${maxRetries + 1} percobaan`);
}

function calcAmounts(data: {
  rentAmount?: string | number | null;
  serviceChargeAmount?: string | number | null;
  electricityChargeAmount?: string | number | null;
  waterChargeAmount?: string | number | null;
  otherChargeAmount?: string | number | null;
  discountAmount?: string | number | null;
  penaltyAmount?: string | number | null;
  taxAmount?: string | number | null;
  paidAmount?: string | number | null;
}) {
  const rent = Number(data.rentAmount ?? 0);
  const service = Number(data.serviceChargeAmount ?? 0);
  const elec = Number(data.electricityChargeAmount ?? 0);
  const water = Number(data.waterChargeAmount ?? 0);
  const other = Number(data.otherChargeAmount ?? 0);
  const discount = Number(data.discountAmount ?? 0);
  const penalty = Number(data.penaltyAmount ?? 0);
  const tax = Number(data.taxAmount ?? 0);
  const paid = Number(data.paidAmount ?? 0);

  const subtotal = rent + service + elec + water + other - discount + penalty;
  const total = subtotal + tax;
  const outstanding = Math.max(total - paid, 0);

  return {
    subtotal: String(subtotal),
    totalAmount: String(total),
    outstandingAmount: String(outstanding),
  };
}

function resolveStatus(totalAmount: number, paidAmount: number, dueDate?: string | null): string {
  if (paidAmount <= 0) {
    if (dueDate && new Date(dueDate) < new Date()) return "overdue";
    return "unpaid";
  }
  if (paidAmount >= totalAmount) return "paid";
  return "partial";
}

const invoiceSelect = {
  id: tenantInvoicesTable.id,
  invoiceNumber: tenantInvoicesTable.invoiceNumber,
  tenantId: tenantInvoicesTable.tenantId,
  bookingId: tenantInvoicesTable.bookingId,
  unitCode: tenantInvoicesTable.unitCode,
  periodStart: tenantInvoicesTable.periodStart,
  periodEnd: tenantInvoicesTable.periodEnd,
  dueDate: tenantInvoicesTable.dueDate,
  rentAmount: tenantInvoicesTable.rentAmount,
  serviceChargeAmount: tenantInvoicesTable.serviceChargeAmount,
  electricityChargeAmount: tenantInvoicesTable.electricityChargeAmount,
  waterChargeAmount: tenantInvoicesTable.waterChargeAmount,
  otherChargeAmount: tenantInvoicesTable.otherChargeAmount,
  discountAmount: tenantInvoicesTable.discountAmount,
  penaltyAmount: tenantInvoicesTable.penaltyAmount,
  subtotal: tenantInvoicesTable.subtotal,
  taxAmount: tenantInvoicesTable.taxAmount,
  totalAmount: tenantInvoicesTable.totalAmount,
  paidAmount: tenantInvoicesTable.paidAmount,
  outstandingAmount: tenantInvoicesTable.outstandingAmount,
  status: tenantInvoicesTable.status,
  notes: tenantInvoicesTable.notes,
  createdAt: tenantInvoicesTable.createdAt,
  updatedAt: tenantInvoicesTable.updatedAt,
  tenantName: tenantsTable.businessName,
  ownerName: tenantsTable.ownerName,
  boothNumber: tenantsTable.boothNumber,
  areaName: tenantsTable.areaName,
  email: tenantsTable.email,
  phone: tenantsTable.phone,
} as const;

// ─── GET /api/tenant-invoices/ppn-report ─────────────────────────────────────
router.get("/tenant-invoices/ppn-report", async (req, res) => {
  try {
    const { from, to } = req.query; // format: YYYY-MM

    const fromMonth = from ? String(from) : new Date().toISOString().slice(0, 7);
    const toMonth   = to   ? String(to)   : fromMonth;

    // Konversi YYYY-MM ke range tanggal
    const fromDate = `${fromMonth}-01`;
    const [toYear, toMon] = toMonth.split("-").map(Number);
    const lastDay = new Date(toYear, toMon, 0).getDate();
    const toDate  = `${toMonth}-${String(lastDay).padStart(2, "0")}`;

    const siteFilter = req.siteId > 0
      ? sql`AND site_id = ${req.siteId}`
      : sql``;

    // Summary per bulan
    const rows = await db.execute(sql`
      SELECT
        TO_CHAR(COALESCE(period_start, created_at::date), 'YYYY-MM') AS bulan,
        COUNT(*)::int                                                  AS jumlah_invoice,
        SUM(subtotal::numeric)                                         AS total_subtotal,
        SUM(tax_amount::numeric)                                       AS total_ppn,
        SUM(total_amount::numeric)                                     AS total_tagihan,
        SUM(paid_amount::numeric)                                      AS total_terbayar
      FROM tenant_invoices
      WHERE status NOT IN ('cancelled', 'draft')
        AND COALESCE(period_start, created_at::date) BETWEEN ${fromDate}::date AND ${toDate}::date
        ${siteFilter}
      GROUP BY TO_CHAR(COALESCE(period_start, created_at::date), 'YYYY-MM')
      ORDER BY bulan ASC
    `);

    // Grand total
    const totals = await db.execute(sql`
      SELECT
        COUNT(*)::int            AS jumlah_invoice,
        SUM(subtotal::numeric)   AS total_subtotal,
        SUM(tax_amount::numeric) AS total_ppn,
        SUM(total_amount::numeric) AS total_tagihan,
        SUM(paid_amount::numeric)  AS total_terbayar
      FROM tenant_invoices
      WHERE status NOT IN ('cancelled', 'draft')
        AND COALESCE(period_start, created_at::date) BETWEEN ${fromDate}::date AND ${toDate}::date
        ${siteFilter}
    `);

    res.json({
      from: fromMonth,
      to: toMonth,
      rows: rows.rows,
      totals: totals.rows[0] ?? {},
    });
  } catch (err) {
    req.log.error(err, "Failed to get PPN report");
    res.status(500).json({ error: "Gagal mengambil laporan PPN" });
  }
});

// ─── GET /api/tenant-invoices/upcoming ───────────────────────────────────────
// Invoice yang akan jatuh tempo dalam 7 hari ke depan + yang sudah overdue
router.get("/tenant-invoices/upcoming", async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in7 = new Date(today);
    in7.setDate(in7.getDate() + 7);

    const todayStr = today.toISOString().slice(0, 10);
    const in7Str = in7.toISOString().slice(0, 10);

    const siteFilter = req.siteId > 0
      ? eq(tenantInvoicesTable.siteId, req.siteId)
      : undefined;

    const rows = await db
      .select({
        id: tenantInvoicesTable.id,
        invoiceNumber: tenantInvoicesTable.invoiceNumber,
        dueDate: tenantInvoicesTable.dueDate,
        outstandingAmount: tenantInvoicesTable.outstandingAmount,
        status: tenantInvoicesTable.status,
        tenantName: tenantsTable.businessName,
        ownerName: tenantsTable.ownerName,
      })
      .from(tenantInvoicesTable)
      .leftJoin(tenantsTable, eq(tenantInvoicesTable.tenantId, tenantsTable.id))
      .where(
        and(
          notInArray(tenantInvoicesTable.status, ["paid", "cancelled"]),
          lte(tenantInvoicesTable.dueDate, in7Str),
          siteFilter,
        )
      )
      .orderBy(tenantInvoicesTable.dueDate);

    const overdueItems = rows.filter(r => r.dueDate && r.dueDate < todayStr);
    const upcomingItems = rows.filter(r => r.dueDate && r.dueDate >= todayStr);

    res.json({
      count: rows.length,
      overdueCount: overdueItems.length,
      upcomingCount: upcomingItems.length,
      overdue: overdueItems,
      upcoming: upcomingItems,
    });
  } catch (err) {
    req.log.error(err, "Failed to get upcoming invoices");
    res.status(500).json({ error: "Gagal mengambil data invoice upcoming" });
  }
});

// ─── GET /api/tenant-invoices ─────────────────────────────────────────────────
router.get("/tenant-invoices", async (req, res) => {
  try {
    const { status, tenantId, search } = req.query;

    let query = db
      .select(invoiceSelect)
      .from(tenantInvoicesTable)
      .leftJoin(tenantsTable, eq(tenantInvoicesTable.tenantId, tenantsTable.id))
      .$dynamic();

    const conditions = [];
    if (req.siteId > 0) {
      conditions.push(eq(tenantInvoicesTable.siteId, req.siteId));
    }
    if (status && status !== "all") {
      conditions.push(eq(tenantInvoicesTable.status, String(status)));
    }
    if (tenantId && !isNaN(Number(tenantId))) {
      conditions.push(eq(tenantInvoicesTable.tenantId, Number(tenantId)));
    }
    if (search) {
      const s = `%${String(search)}%`;
      conditions.push(
        or(
          ilike(tenantInvoicesTable.invoiceNumber, s),
          ilike(tenantsTable.businessName, s),
          ilike(tenantInvoicesTable.unitCode, s),
        )!
      );
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    const rows = await query.orderBy(desc(tenantInvoicesTable.createdAt));
    res.json(rows);
  } catch (err) {
    req.log.error(err, "Failed to list invoices");
    res.status(500).json({ error: "Gagal mengambil data invoice" });
  }
});

// ─── GET /api/tenant-invoices/:id ─────────────────────────────────────────────
router.get("/tenant-invoices/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid" }); return; }

  try {
    const [invoice] = await db
      .select(invoiceSelect)
      .from(tenantInvoicesTable)
      .leftJoin(tenantsTable, eq(tenantInvoicesTable.tenantId, tenantsTable.id))
      .where(eq(tenantInvoicesTable.id, id));

    if (!invoice) { res.status(404).json({ error: "Invoice tidak ditemukan" }); return; }

    const payments = await db
      .select()
      .from(tenantPaymentsTable)
      .where(eq(tenantPaymentsTable.invoiceId, id))
      .orderBy(desc(tenantPaymentsTable.paidAt));

    res.json({ ...invoice, payments });
  } catch (err) {
    req.log.error(err, "Failed to get invoice");
    res.status(500).json({ error: "Gagal mengambil invoice" });
  }
});

// ─── GET /api/tenant-invoices/:id/payment-link ────────────────────────────────
router.get("/tenant-invoices/:id/payment-link", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid" }); return; }

  try {
    const [row] = await db
      .select({
        id: tenantInvoicesTable.id,
        paymentToken: tenantInvoicesTable.paymentToken,
        status: tenantInvoicesTable.status,
        invoiceNumber: tenantInvoicesTable.invoiceNumber,
      })
      .from(tenantInvoicesTable)
      .where(eq(tenantInvoicesTable.id, id));

    if (!row) { res.status(404).json({ error: "Invoice tidak ditemukan" }); return; }

    if (!row.paymentToken) {
      res.status(422).json({ error: "Invoice ini belum memiliki token pembayaran. Coba kirim link WA terlebih dahulu untuk membuat token." });
      return;
    }

    const base = await getBaseUrl();
    if (!base) {
      res.status(422).json({ error: "Domain pembayaran belum dikonfigurasi. Isi di Pengaturan → Domain Link Pembayaran." });
      return;
    }

    res.json({
      invoiceNumber: row.invoiceNumber,
      status: row.status,
      link: `${base}/bayar/${row.paymentToken}`,
    });
  } catch (err) {
    req.log.error(err, "Failed to get payment link");
    res.status(500).json({ error: "Gagal mengambil link pembayaran" });
  }
});

// ─── POST /api/tenant-invoices/bulk ──────────────────────────────────────────
const bulkInvoiceItemSchema = z.object({
  tenantId: z.number().int().positive({ message: "Tenant wajib dipilih" }),
  unitCode: z.string().optional().nullable(),
  periodStart: z.string().optional().nullable(),
  periodEnd: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  rentAmount: z.union([z.string(), z.number()]).optional().nullable(),
  serviceChargeAmount: z.union([z.string(), z.number()]).optional().nullable(),
  electricityChargeAmount: z.union([z.string(), z.number()]).optional().nullable(),
  waterChargeAmount: z.union([z.string(), z.number()]).optional().nullable(),
  otherChargeAmount: z.union([z.string(), z.number()]).optional().nullable(),
  discountAmount: z.union([z.string(), z.number()]).optional().nullable(),
  penaltyAmount: z.union([z.string(), z.number()]).optional().nullable(),
  taxAmount: z.union([z.string(), z.number()]).optional().nullable(),
  notes: z.string().optional().nullable(),
  status: z.enum(["draft", "unpaid", "partial", "paid", "overdue", "cancelled"]).optional(),
});

router.post("/tenant-invoices/bulk", async (req, res) => {
  const parsed = z.array(bulkInvoiceItemSchema).min(1, "Minimal 1 invoice").safeParse(req.body);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    res.status(400).json({ error: msg });
    return;
  }

  const results: { tenantId: number; invoiceNumber: string; success: boolean; error?: string }[] = [];

  for (const item of parsed.data) {
    try {
      // Cek duplikat: jika sudah ada invoice untuk tenant + periode yang sama, skip
      if (item.periodStart && item.periodEnd) {
        const startDate = new Date(item.periodStart);
        const endDate = new Date(item.periodEnd);
        const existing = await db
          .select({ id: tenantInvoicesTable.id, invoiceNumber: tenantInvoicesTable.invoiceNumber })
          .from(tenantInvoicesTable)
          .where(
            and(
              eq(tenantInvoicesTable.tenantId, item.tenantId),
              sql`DATE(${tenantInvoicesTable.periodStart}) = DATE(${startDate.toISOString()})`,
              sql`DATE(${tenantInvoicesTable.periodEnd}) = DATE(${endDate.toISOString()})`,
            )
          )
          .limit(1);
        if (existing.length > 0) {
          results.push({
            tenantId: item.tenantId,
            invoiceNumber: existing[0].invoiceNumber,
            success: false,
            error: `Invoice ${existing[0].invoiceNumber} sudah ada untuk periode ini`,
          });
          continue;
        }
      }

      const { subtotal, totalAmount, outstandingAmount } = calcAmounts(item);
      const status = item.status ?? resolveStatus(Number(totalAmount), 0, item.dueDate ?? null);

      const invoice = await insertInvoiceSafe({
        ...(req.siteId > 0 ? { siteId: req.siteId } : {}),
        tenantId: item.tenantId,
        unitCode: item.unitCode ?? null,
        periodStart: item.periodStart ?? null,
        periodEnd: item.periodEnd ?? null,
        dueDate: item.dueDate ?? null,
        rentAmount: String(item.rentAmount ?? "0"),
        serviceChargeAmount: String(item.serviceChargeAmount ?? "0"),
        electricityChargeAmount: String(item.electricityChargeAmount ?? "0"),
        waterChargeAmount: String(item.waterChargeAmount ?? "0"),
        otherChargeAmount: String(item.otherChargeAmount ?? "0"),
        discountAmount: String(item.discountAmount ?? "0"),
        penaltyAmount: String(item.penaltyAmount ?? "0"),
        taxAmount: String(item.taxAmount ?? "0"),
        subtotal,
        totalAmount,
        paidAmount: "0",
        outstandingAmount,
        status,
        notes: item.notes ?? null,
      });

      logAudit(req, {
        action: "create_invoice",
        entityType: "invoice",
        entityId: invoice.id,
        afterData: { ...invoice, bulk: true },
      });

      results.push({ tenantId: item.tenantId, invoiceNumber: invoice.invoiceNumber, success: true });
    } catch (err) {
      req.log.error(err, `Failed to create bulk invoice for tenant ${item.tenantId}`);
      results.push({ tenantId: item.tenantId, invoiceNumber: "", success: false, error: (err as Error).message });
    }
  }

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  res.status(succeeded > 0 ? 201 : 500).json({ results, succeeded, failed });
});

// ─── POST /api/tenant-invoices ─────────────────────────────────────────────────
const createInvoiceSchema = z.object({
  tenantId: z.number().int().positive({ message: "Tenant wajib dipilih" }),
  bookingId: z.number().int().positive().optional().nullable(),
  unitCode: z.string().optional().nullable(),
  periodStart: z.string().optional().nullable(),
  periodEnd: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  rentAmount: z.union([z.string(), z.number()]).optional().nullable(),
  serviceChargeAmount: z.union([z.string(), z.number()]).optional().nullable(),
  electricityChargeAmount: z.union([z.string(), z.number()]).optional().nullable(),
  waterChargeAmount: z.union([z.string(), z.number()]).optional().nullable(),
  otherChargeAmount: z.union([z.string(), z.number()]).optional().nullable(),
  discountAmount: z.union([z.string(), z.number()]).optional().nullable(),
  penaltyAmount: z.union([z.string(), z.number()]).optional().nullable(),
  taxAmount: z.union([z.string(), z.number()]).optional().nullable(),
  notes: z.string().optional().nullable(),
  status: z.enum(["draft", "unpaid", "partial", "paid", "overdue", "cancelled"]).optional(),
});

router.post("/tenant-invoices", async (req, res) => {
  const parsed = createInvoiceSchema.safeParse(req.body);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    res.status(400).json({ error: msg });
    return;
  }

  const data = parsed.data;
  const { subtotal, totalAmount, outstandingAmount } = calcAmounts(data);

  const status = data.status ?? resolveStatus(
    Number(totalAmount),
    0,
    data.dueDate ?? null,
  );

  try {
    const invoice = await insertInvoiceSafe({
      ...(req.siteId > 0 ? { siteId: req.siteId } : {}),
      siteId: req.siteId > 0 ? req.siteId : undefined,
      tenantId: data.tenantId,
      bookingId: data.bookingId ?? null,
      unitCode: data.unitCode ?? null,
      periodStart: data.periodStart ?? null,
      periodEnd: data.periodEnd ?? null,
      dueDate: data.dueDate ?? null,
      rentAmount: String(data.rentAmount ?? "0"),
      serviceChargeAmount: String(data.serviceChargeAmount ?? "0"),
      electricityChargeAmount: String(data.electricityChargeAmount ?? "0"),
      waterChargeAmount: String(data.waterChargeAmount ?? "0"),
      otherChargeAmount: String(data.otherChargeAmount ?? "0"),
      discountAmount: String(data.discountAmount ?? "0"),
      penaltyAmount: String(data.penaltyAmount ?? "0"),
      taxAmount: String(data.taxAmount ?? "0"),
      subtotal,
      totalAmount,
      paidAmount: "0",
      outstandingAmount,
      status,
      notes: data.notes ?? null,
    });

    const [withTenant] = await db
      .select(invoiceSelect)
      .from(tenantInvoicesTable)
      .leftJoin(tenantsTable, eq(tenantInvoicesTable.tenantId, tenantsTable.id))
      .where(eq(tenantInvoicesTable.id, invoice.id));

    logAudit(req, {
      action: "create_invoice",
      entityType: "invoice",
      entityId: withTenant?.id,
      afterData: withTenant,
    });
    res.status(201).json(withTenant);
  } catch (err) {
    req.log.error(err, "Failed to create invoice");
    res.status(500).json({ error: "Gagal membuat invoice" });
  }
});

// ─── PATCH /api/tenant-invoices/:id ──────────────────────────────────────────
router.patch("/tenant-invoices/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid" }); return; }

  const parsed = createInvoiceSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    res.status(400).json({ error: msg });
    return;
  }

  try {
    const [existing] = await db
      .select()
      .from(tenantInvoicesTable)
      .where(eq(tenantInvoicesTable.id, id));

    if (!existing) { res.status(404).json({ error: "Invoice tidak ditemukan" }); return; }
    if (existing.status === "cancelled") {
      res.status(409).json({ error: "Invoice yang dibatalkan tidak dapat diubah" });
      return;
    }

    const merged = { ...existing, ...parsed.data };
    const { subtotal, totalAmount, outstandingAmount } = calcAmounts({
      ...merged,
      paidAmount: existing.paidAmount,
    });

    const status = parsed.data.status ?? resolveStatus(
      Number(totalAmount),
      Number(existing.paidAmount),
      merged.dueDate ?? null,
    );

    const [updated] = await db
      .update(tenantInvoicesTable)
      .set({
        unitCode: merged.unitCode ?? null,
        periodStart: merged.periodStart ?? null,
        periodEnd: merged.periodEnd ?? null,
        dueDate: merged.dueDate ?? null,
        rentAmount: String(merged.rentAmount ?? "0"),
        serviceChargeAmount: String(merged.serviceChargeAmount ?? "0"),
        electricityChargeAmount: String(merged.electricityChargeAmount ?? "0"),
        waterChargeAmount: String(merged.waterChargeAmount ?? "0"),
        otherChargeAmount: String(merged.otherChargeAmount ?? "0"),
        discountAmount: String(merged.discountAmount ?? "0"),
        penaltyAmount: String(merged.penaltyAmount ?? "0"),
        taxAmount: String(merged.taxAmount ?? "0"),
        subtotal,
        totalAmount,
        outstandingAmount,
        status,
        notes: merged.notes ?? null,
        updatedAt: new Date(),
      })
      .where(eq(tenantInvoicesTable.id, id))
      .returning();

    const [withTenant] = await db
      .select(invoiceSelect)
      .from(tenantInvoicesTable)
      .leftJoin(tenantsTable, eq(tenantInvoicesTable.tenantId, tenantsTable.id))
      .where(eq(tenantInvoicesTable.id, updated.id));

    sseBroker.publish("invoice_updated", { invoiceId: id });
    res.json(withTenant);
  } catch (err) {
    req.log.error(err, "Failed to update invoice");
    res.status(500).json({ error: "Gagal memperbarui invoice" });
  }
});

// ─── POST /api/tenant-invoices/generate-from-booking/:bookingId ───────────────
router.post("/tenant-invoices/generate-from-booking/:bookingId", async (req, res) => {
  const bookingId = Number(req.params.bookingId);
  if (isNaN(bookingId)) { res.status(400).json({ error: "ID booking tidak valid" }); return; }

  try {
    const [booking] = await db
      .select()
      .from(tenantBookingsTable)
      .where(eq(tenantBookingsTable.id, bookingId));

    if (!booking) { res.status(404).json({ error: "Booking tidak ditemukan" }); return; }

    const [tenant] = await db
      .select()
      .from(tenantsTable)
      .where(eq(tenantsTable.id, booking.tenantId));

    if (!tenant) { res.status(404).json({ error: "Tenant tidak ditemukan" }); return; }

    if (!booking.tenantId) {
      res.status(400).json({ error: "Booking tidak memiliki tenant_id yang valid" });
      return;
    }

    const billingCycle = booking.billingCycle ?? "monthly";
    const startDate = booking.startDate ? new Date(booking.startDate) : new Date();
    const now = new Date();

    let periodStart: Date;
    let periodEnd: Date;
    let dueDate: Date;

    if (billingCycle === "monthly") {
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      dueDate = new Date(now.getFullYear(), now.getMonth() + 1, 5);
    } else if (billingCycle === "quarterly") {
      const q = Math.floor(now.getMonth() / 3);
      periodStart = new Date(now.getFullYear(), q * 3, 1);
      periodEnd = new Date(now.getFullYear(), q * 3 + 3, 0);
      dueDate = new Date(periodEnd);
      dueDate.setDate(dueDate.getDate() + 5);
    } else if (billingCycle === "yearly") {
      periodStart = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
      periodEnd = new Date(startDate.getFullYear() + 1, startDate.getMonth(), 0);
      dueDate = new Date(periodEnd);
      dueDate.setDate(dueDate.getDate() + 14);
    } else {
      periodStart = startDate;
      periodEnd = booking.endDate
        ? new Date(booking.endDate)
        : new Date(now.getFullYear(), now.getMonth() + 1, 0);
      dueDate = new Date(periodEnd);
      dueDate.setDate(dueDate.getDate() + 5);
    }

    const toDateStr = (d: Date) => d.toISOString().slice(0, 10);

    const periodStartStr = toDateStr(periodStart);
    const periodEndStr = toDateStr(periodEnd);
    const dueDateStr = toDateStr(dueDate);

    // ── Idempotency: jika invoice untuk booking+periode ini sudah ada, kembalikan
    const [existingInvoice] = await db
      .select(invoiceSelect)
      .from(tenantInvoicesTable)
      .leftJoin(tenantsTable, eq(tenantInvoicesTable.tenantId, tenantsTable.id))
      .where(
        and(
          eq(tenantInvoicesTable.bookingId, bookingId),
          eq(tenantInvoicesTable.periodStart, periodStartStr),
          eq(tenantInvoicesTable.periodEnd, periodEndStr),
        ),
      );

    if (existingInvoice) {
      req.log.info(
        { invoiceId: existingInvoice.id, bookingId },
        "Invoice untuk periode ini sudah ada, dikembalikan",
      );
      res.status(409).json({
        error: "Invoice untuk booking dan periode ini sudah dibuat sebelumnya",
        invoice: existingInvoice,
      });
      return;
    }

    const rent = Number(booking.rentAmount ?? 0);
    const service = Number(booking.serviceChargeAmount ?? 0);
    const elec = Number(booking.electricityChargeAmount ?? 0);
    const water = Number(booking.waterChargeAmount ?? 0);
    const subtotalVal = rent + service + elec + water;

    // Gunakan insertInvoiceSafe agar tidak 500 jika ada race condition pada invoice number
    const invoice = await insertInvoiceSafe({
      ...(req.siteId > 0 ? { siteId: req.siteId } : {}),
      siteId: req.siteId > 0 ? req.siteId : undefined,
      tenantId: booking.tenantId,
      bookingId,
      unitCode: booking.unitCode ?? null,
      periodStart: periodStartStr,
      periodEnd: periodEndStr,
      dueDate: dueDateStr,
      rentAmount: String(rent),
      serviceChargeAmount: String(service),
      electricityChargeAmount: String(elec),
      waterChargeAmount: String(water),
      otherChargeAmount: "0",
      discountAmount: "0",
      penaltyAmount: "0",
      taxAmount: "0",
      subtotal: String(subtotalVal),
      totalAmount: String(subtotalVal),
      paidAmount: "0",
      outstandingAmount: String(subtotalVal),
      status: new Date(dueDateStr) < now ? "overdue" : "unpaid",
      notes: (req.body as Record<string, unknown>).notes as string ?? null,
    });

    const [withTenant] = await db
      .select(invoiceSelect)
      .from(tenantInvoicesTable)
      .leftJoin(tenantsTable, eq(tenantInvoicesTable.tenantId, tenantsTable.id))
      .where(eq(tenantInvoicesTable.id, invoice.id));

    req.log.info(
      { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, bookingId },
      "Invoice berhasil dibuat dari booking",
    );

    logAudit(req, {
      action: "create_invoice",
      entityType: "invoice",
      entityId: invoice.id,
      afterData: withTenant,
    });
    res.status(201).json(withTenant);
  } catch (err) {
    req.log.error({ err, bookingId }, "Gagal membuat invoice dari booking");
    res.status(500).json({ error: "Gagal membuat invoice dari booking" });
  }
});

// ─── POST /api/tenant-invoices/:id/cancel ────────────────────────────────────
router.post("/tenant-invoices/:id/cancel", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid" }); return; }

  try {
    const [existing] = await db
      .select()
      .from(tenantInvoicesTable)
      .where(eq(tenantInvoicesTable.id, id));

    if (!existing) { res.status(404).json({ error: "Invoice tidak ditemukan" }); return; }
    if (existing.status === "paid") {
      res.status(409).json({ error: "Invoice yang sudah lunas tidak dapat dibatalkan" });
      return;
    }

    const [updated] = await db
      .update(tenantInvoicesTable)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(tenantInvoicesTable.id, id))
      .returning();

    logAudit(req, {
      action: "cancel_invoice",
      entityType: "invoice",
      entityId: id,
      beforeData: existing,
      afterData: updated,
    });
    res.json(updated);
  } catch (err) {
    req.log.error(err, "Failed to cancel invoice");
    res.status(500).json({ error: "Gagal membatalkan invoice" });
  }
});

// ─── POST /api/tenant-invoices/:id/payment ────────────────────────────────────
const invoicePaymentSchema = z.object({
  amountPaid: z.number().positive({ message: "Jumlah bayar harus lebih dari 0" }),
  paymentMethod: z.enum(["tunai", "transfer", "qris", "edc", "other"]).default("tunai"),
  paymentDate: z.string().optional(),
  notes: z.string().optional().nullable(),
});

router.post("/tenant-invoices/:id/payment", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid" }); return; }

  const parsed = invoicePaymentSchema.safeParse(req.body);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    res.status(400).json({ error: msg });
    return;
  }

  const { amountPaid, paymentMethod, paymentDate, notes } = parsed.data;

  try {
    const result = await db.transaction(async (tx) => {
      const [invoice] = await tx
        .select()
        .from(tenantInvoicesTable)
        .where(eq(tenantInvoicesTable.id, id))
        .for("update");

      if (!invoice) throw Object.assign(new Error("Invoice tidak ditemukan"), { status: 404 });
      if (invoice.status === "cancelled") throw Object.assign(new Error("Invoice telah dibatalkan"), { status: 409 });
      if (invoice.status === "paid") throw Object.assign(new Error("Invoice ini sudah lunas"), { status: 409 });

      const newPaidAmount = Number(invoice.paidAmount) + amountPaid;
      const total = Number(invoice.totalAmount);
      const outstanding = Math.max(total - newPaidAmount, 0);

      let newStatus: string;
      if (newPaidAmount >= total) newStatus = "paid";
      else if (newPaidAmount > 0) newStatus = "partial";
      else newStatus = invoice.dueDate && new Date(invoice.dueDate) < new Date() ? "overdue" : "unpaid";

      const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const prefix = `INV-PAY-${datePart}-`;
      const [countRow] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(tenantPaymentsTable)
        .where(sql`receipt_number LIKE ${prefix + "%"}`);
      const seq = ((countRow?.count ?? 0) + 1).toString().padStart(4, "0");
      const receiptNumber = `${prefix}${seq}`;

      const paidAt = paymentDate ? new Date(paymentDate) : new Date();

      const [payment] = await tx
        .insert(tenantPaymentsTable)
        .values({
          ...(req.siteId > 0 ? { siteId: req.siteId } : {}),
          siteId: req.siteId > 0 ? req.siteId : undefined,
          invoiceId: id,
          tenantId: invoice.tenantId,
          bookingId: invoice.bookingId ?? null,
          tenantBookingId: invoice.bookingId ?? null,
          amount: String(amountPaid),
          discountAmount: "0",
          penaltyAmount: "0",
          paymentMethod,
          paymentStatus: "PAID",
          receiptNumber,
          notes: notes ?? null,
          paidAt,
        })
        .returning();

      const [updatedInvoice] = await tx
        .update(tenantInvoicesTable)
        .set({
          paidAmount: String(newPaidAmount),
          outstandingAmount: String(outstanding),
          status: newStatus,
          updatedAt: new Date(),
        })
        .where(eq(tenantInvoicesTable.id, id))
        .returning();

      return { payment, invoice: updatedInvoice, receiptNumber, newStatus, newPaidAmount, outstanding };
    });

    logAudit(req, {
      action: "create_payment",
      entityType: "payment",
      entityId: result.payment.id,
      afterData: {
        paymentId: result.payment.id,
        invoiceId: id,
        amountPaid,
        paymentMethod,
        receiptNumber: result.receiptNumber,
        invoiceStatus: result.newStatus,
      },
    });
    sseBroker.publish("payment_created", { paymentId: result.payment.id, invoiceId: id });

    writePaymentEvent({
      sourceApp: "tenant_management",
      ownerApp: "tenant_management",
      sourceModule: "tenant_invoice",
      sourceTable: "tenant_payments",
      sourceId: result.payment.id,
      tenantId: result.payment.tenantId ?? null,
      siteId: result.payment.siteId ?? null,
      invoiceId: id,
      amount: amountPaid,
      direction: "IN",
      paymentMethod: normalizePaymentMethod(paymentMethod),
      paymentStatus: "confirmed",
      metadata: {
        receiptNumber: result.receiptNumber,
        invoiceStatus: result.newStatus,
        source: "direct_invoice_payment",
      },
    }).catch(() => {});

    res.status(201).json({
      success: true,
      payment: result.payment,
      receiptNumber: result.receiptNumber,
      invoiceStatus: result.newStatus,
      paidAmount: result.newPaidAmount,
      outstandingAmount: result.outstanding,
    });
  } catch (err) {
    const e = err as Error & { status?: number };
    if (e.status) {
      res.status(e.status).json({ error: e.message });
    } else {
      req.log.error(err, "Failed to record invoice payment");
      res.status(500).json({ error: "Gagal memproses pembayaran invoice" });
    }
  }
});

// ─── DELETE /api/tenant-invoices/:id ─────────────────────────────────────────
router.delete("/tenant-invoices/:id", requireAnyRole("owner", "admin"), async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid" }); return; }

  try {
    const [existing] = await db
      .select()
      .from(tenantInvoicesTable)
      .where(eq(tenantInvoicesTable.id, id));

    if (!existing) { res.status(404).json({ error: "Invoice tidak ditemukan" }); return; }

    if (existing.status === "paid") {
      res.status(409).json({ error: "Invoice yang sudah lunas tidak dapat dihapus" });
      return;
    }

    const relatedPayments = await db
      .select()
      .from(tenantPaymentsTable)
      .where(eq(tenantPaymentsTable.invoiceId, id));

    if (relatedPayments.length > 0) {
      res.status(409).json({ error: "Invoice yang sudah memiliki pembayaran tidak dapat dihapus" });
      return;
    }

    await db.delete(tenantInvoicesTable).where(eq(tenantInvoicesTable.id, id));

    logAudit(req, {
      action: "delete_invoice",
      entityType: "invoice",
      entityId: id,
      beforeData: existing,
    });

    res.json({ success: true, message: "Invoice berhasil dihapus" });
  } catch (err) {
    req.log.error(err, "Failed to delete invoice");
    res.status(500).json({ error: "Gagal menghapus invoice" });
  }
});

export default router;
