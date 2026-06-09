import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  tenantInvoicesTable,
  tenantBookingsTable,
  tenantsTable,
  tenantPaymentsTable,
} from "@workspace/db/schema";
import { eq, and, sql, desc, ilike, or } from "drizzle-orm";
import { z } from "zod/v4";
import { requireAnyRole } from "../middlewares/auth";

const router: IRouter = Router();
router.use(requireAnyRole("owner", "admin", "finance"));

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function generateInvoiceNumber(): Promise<string> {
  const now = new Date();
  const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prefix = `INV-TENANT/${yyyymm}/`;

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tenantInvoicesTable)
    .where(sql`invoice_number LIKE ${prefix + "%"}`);

  const seq = ((row?.count ?? 0) + 1).toString().padStart(5, "0");
  return `${prefix}${seq}`;
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
  const invoiceNumber = await generateInvoiceNumber();

  const status = data.status ?? resolveStatus(
    Number(totalAmount),
    0,
    data.dueDate ?? null,
  );

  try {
    const [invoice] = await db
      .insert(tenantInvoicesTable)
      .values({
        invoiceNumber,
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
      })
      .returning();

    const [withTenant] = await db
      .select(invoiceSelect)
      .from(tenantInvoicesTable)
      .leftJoin(tenantsTable, eq(tenantInvoicesTable.tenantId, tenantsTable.id))
      .where(eq(tenantInvoicesTable.id, invoice.id));

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
      periodEnd = booking.endDate ? new Date(booking.endDate) : new Date(now.getFullYear(), now.getMonth() + 1, 0);
      dueDate = new Date(periodEnd);
      dueDate.setDate(dueDate.getDate() + 5);
    }

    const toDateStr = (d: Date) => d.toISOString().slice(0, 10);

    const rent = Number(booking.rentAmount ?? 0);
    const service = Number(booking.serviceChargeAmount ?? 0);
    const elec = Number(booking.electricityChargeAmount ?? 0);
    const water = Number(booking.waterChargeAmount ?? 0);
    const subtotalVal = rent + service + elec + water;

    const invoiceNumber = await generateInvoiceNumber();

    const [invoice] = await db
      .insert(tenantInvoicesTable)
      .values({
        invoiceNumber,
        tenantId: booking.tenantId,
        bookingId,
        unitCode: booking.unitCode ?? null,
        periodStart: toDateStr(periodStart),
        periodEnd: toDateStr(periodEnd),
        dueDate: toDateStr(dueDate),
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
        status: new Date(toDateStr(dueDate)) < now ? "overdue" : "unpaid",
        notes: req.body.notes ?? null,
      })
      .returning();

    const [withTenant] = await db
      .select(invoiceSelect)
      .from(tenantInvoicesTable)
      .leftJoin(tenantsTable, eq(tenantInvoicesTable.tenantId, tenantsTable.id))
      .where(eq(tenantInvoicesTable.id, invoice.id));

    res.status(201).json(withTenant);
  } catch (err) {
    req.log.error(err, "Failed to generate invoice from booking");
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
          invoiceId: id,
          tenantId: invoice.tenantId,
          bookingId: invoice.bookingId ?? null,
          amount: amountPaid,
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

export default router;
