import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";
import { paymentRateLimiter } from "../middlewares/rate-limit";
import { db } from "@workspace/db";
import {
  tenantsTable,
  tenantBookingsTable,
  tenantPaymentsTable,
  tenantInvoicesTable,
  cashierShiftsTable,
} from "@workspace/db/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { z } from "zod";
import { requireAnyRole } from "../middlewares/auth";
import { logAudit } from "../lib/audit";
import { sseBroker } from "../lib/sse-broker";

const router: IRouter = Router();

router.use("/tenant-pos", requireAnyRole("owner", "admin", "finance", "cashier"));

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function generateReceiptNumber(): Promise<string> {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `TENANT-PAY-${datePart}-`;
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tenantPaymentsTable)
    .where(sql`receipt_number LIKE ${prefix + "%"}`);
  const seq = ((row?.count ?? 0) + 1).toString().padStart(4, "0");
  return `${prefix}${seq}`;
}

function getSessionUser(req: any): { role: string; name: string; id?: string; dbId?: number } | null {
  if (req.user && typeof req.user === "object") {
    return req.user as { role: string; name: string; id?: string; dbId?: number };
  }
  return null;
}

// ─── GET /api/tenant-pos/overview ────────────────────────────────────────────
router.get("/tenant-pos/overview", async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const siteId = req.siteId;

    const tenantSiteFilter = siteId > 0 ? eq(tenantsTable.siteId, siteId) : undefined;
    const bookingSiteFilter = siteId > 0 ? eq(tenantBookingsTable.siteId, siteId) : undefined;
    const paymentSiteFilter = siteId > 0 ? eq(tenantPaymentsTable.siteId, siteId) : undefined;
    const shiftSiteFilter = siteId > 0 ? eq(cashierShiftsTable.siteId, siteId) : undefined;

    const [totalActive] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tenantsTable)
      .where(and(
        sql`${tenantsTable.status} IN ('aktif', 'active')`,
        tenantSiteFilter
      ));

    const [unpaid] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tenantBookingsTable)
      .where(
        and(
          eq(tenantBookingsTable.bookingStatus, "aktif"),
          sql`upper(${tenantBookingsTable.paymentStatus}) IN ('UNPAID', 'PARTIAL')`,
          bookingSiteFilter
        )
      );

    const [overdue] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tenantBookingsTable)
      .where(and(
        sql`upper(${tenantBookingsTable.paymentStatus}) = 'OVERDUE'`,
        bookingSiteFilter
      ));

    const [paidToday] = await db
      .select({ total: sql<number>`coalesce(sum(amount::numeric), 0)::int` })
      .from(tenantPaymentsTable)
      .where(
        and(
          sql`${tenantPaymentsTable.paidAt}::date = ${today}`,
          eq(tenantPaymentsTable.isVoided, false),
          paymentSiteFilter
        )
      );

    const [openShift] = await db
      .select({
        id: cashierShiftsTable.id,
        cashierName: cashierShiftsTable.cashierName,
        openedAt: cashierShiftsTable.openedAt,
      })
      .from(cashierShiftsTable)
      .where(and(eq(cashierShiftsTable.status, "open"), shiftSiteFilter))
      .orderBy(desc(cashierShiftsTable.openedAt))
      .limit(1);

    res.json({
      totalActiveTenants: totalActive?.count ?? 0,
      unpaidCount: unpaid?.count ?? 0,
      overdueCount: overdue?.count ?? 0,
      paidTodayAmount: paidToday?.total ?? 0,
      currentShift: openShift ?? null,
    });
  } catch (err) {
    req.log.error(err, "Failed to get POS overview");
    res.status(500).json({ error: "Gagal mengambil overview" });
  }
});

// ─── GET /api/tenant-pos/floor-plan ──────────────────────────────────────────
router.get("/tenant-pos/floor-plan", async (req, res) => {
  try {
    const siteId = req.siteId;
    const tenantSiteFilter = siteId > 0 ? eq(tenantsTable.siteId, siteId) : undefined;
    const invoiceSiteFilter = siteId > 0 ? eq(tenantInvoicesTable.siteId, siteId) : undefined;

    const rows = await db
      .select({
        tenantId: tenantsTable.id,
        businessName: tenantsTable.businessName,
        ownerName: tenantsTable.ownerName,
        email: tenantsTable.email,
        phone: tenantsTable.phone,
        category: tenantsTable.category,
        boothNumber: tenantsTable.boothNumber,
        areaName: tenantsTable.areaName,
        tenantStatus: tenantsTable.status,
        logoUrl: tenantsTable.logoUrl,
        bookingId: tenantBookingsTable.id,
        startDate: tenantBookingsTable.startDate,
        endDate: tenantBookingsTable.endDate,
        totalAmount: tenantBookingsTable.totalAmount,
        paidAmount: tenantBookingsTable.paidAmount,
        remainingAmount: tenantBookingsTable.remainingAmount,
        paymentStatus: tenantBookingsTable.paymentStatus,
        bookingStatus: tenantBookingsTable.bookingStatus,
        dueDate: tenantBookingsTable.dueDate,
        periodLabel: tenantBookingsTable.periodLabel,
      })
      .from(tenantsTable)
      .leftJoin(
        tenantBookingsTable,
        and(
          eq(tenantBookingsTable.tenantId, tenantsTable.id),
          sql`${tenantBookingsTable.bookingStatus} IN ('aktif', 'active')`
        )
      )
      .where(tenantSiteFilter)
      .orderBy(tenantsTable.areaName, tenantsTable.id);

    const invoiceCounts = await db
      .select({
        tenantId: tenantInvoicesTable.tenantId,
        openCount: sql<number>`count(*)::int`,
      })
      .from(tenantInvoicesTable)
      .where(and(
        sql`${tenantInvoicesTable.status} IN ('unpaid', 'partial', 'overdue')`,
        invoiceSiteFilter
      ))
      .groupBy(tenantInvoicesTable.tenantId);

    const invoiceCountMap = new Map<number, number>(
      invoiceCounts.map((r) => [r.tenantId, r.openCount])
    );

    const result = rows.map((row: typeof rows[number], idx: number) => ({
      id: `${row.areaName.replace(/\s+/g, "-").toUpperCase()}-${String(idx + 1).padStart(2, "0")}`,
      tenantId: row.tenantId,
      bookingId: row.bookingId ?? null,
      businessName: row.businessName,
      ownerName: row.ownerName,
      email: row.email ?? null,
      phone: row.phone ?? null,
      category: row.category ?? null,
      boothNumber: row.boothNumber ?? `T-${String(idx + 1).padStart(3, "0")}`,
      areaName: row.areaName,
      startDate: row.startDate ?? null,
      endDate: row.endDate ?? null,
      totalAmount: Number(row.totalAmount ?? 0),
      paidAmount: Number(row.paidAmount ?? 0),
      remainingAmount: Number(row.remainingAmount ?? 0),
      paymentStatus: (row.paymentStatus ?? "UNPAID").toUpperCase() as string,
      bookingStatus: row.bookingStatus ?? "aktif",
      dueDate: row.dueDate ?? null,
      periodLabel: row.periodLabel ?? null,
      openInvoiceCount: invoiceCountMap.get(row.tenantId) ?? 0,
      logoUrl: row.logoUrl ?? null,
      tenantStatus: row.tenantStatus ?? null,
    }));

    res.json(result);
  } catch (err) {
    req.log.error(err, "Failed to get floor plan");
    res.status(500).json({ error: "Gagal mengambil data floor-plan" });
  }
});

// ─── GET /api/tenant-pos/tenants/:tenantId/invoices ──────────────────────────
router.get("/tenant-pos/tenants/:tenantId/invoices", async (req, res) => {
  const tenantId = Number(req.params.tenantId);
  if (isNaN(tenantId)) {
    res.status(400).json({ error: "ID tidak valid" });
    return;
  }
  try {
    const invConditions: ReturnType<typeof eq>[] = [
      eq(tenantInvoicesTable.tenantId, tenantId) as any,
      sql`${tenantInvoicesTable.status} IN ('unpaid', 'partial', 'overdue')` as any,
    ];
    if (req.siteId > 0) invConditions.push(eq(tenantInvoicesTable.siteId, req.siteId) as any);

    const invoices = await db
      .select()
      .from(tenantInvoicesTable)
      .where(and(...invConditions))
      .orderBy(tenantInvoicesTable.dueDate, tenantInvoicesTable.id);

    res.json(
      invoices.map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        tenantId: inv.tenantId,
        bookingId: inv.bookingId,
        unitCode: inv.unitCode,
        periodStart: inv.periodStart,
        periodEnd: inv.periodEnd,
        dueDate: inv.dueDate,
        rentAmount: Number(inv.rentAmount),
        serviceChargeAmount: Number(inv.serviceChargeAmount),
        electricityChargeAmount: Number(inv.electricityChargeAmount),
        waterChargeAmount: Number(inv.waterChargeAmount),
        otherChargeAmount: Number(inv.otherChargeAmount),
        discountAmount: Number(inv.discountAmount),
        penaltyAmount: Number(inv.penaltyAmount),
        totalAmount: Number(inv.totalAmount),
        paidAmount: Number(inv.paidAmount),
        outstandingAmount: Number(inv.outstandingAmount),
        status: inv.status,
        notes: inv.notes,
        createdAt: inv.createdAt,
      }))
    );
  } catch (err) {
    req.log.error(err, "Failed to get tenant invoices");
    res.status(500).json({ error: "Gagal mengambil data invoice" });
  }
});

// ─── GET /api/tenant-pos/bookings/:bookingId/payments ────────────────────────
router.get("/tenant-pos/bookings/:bookingId/payments", async (req, res) => {
  const bookingId = Number(req.params.bookingId);
  if (isNaN(bookingId)) {
    res.status(400).json({ error: "ID tidak valid" });
    return;
  }
  try {
    const payments = await db
      .select()
      .from(tenantPaymentsTable)
      .where(eq(tenantPaymentsTable.bookingId, bookingId))
      .orderBy(desc(tenantPaymentsTable.paidAt));

    res.json(
      payments.map((p) => ({
        id: p.id,
        receiptNumber: p.receiptNumber,
        amountPaid: Number(p.amount),
        discountAmount: Number(p.discountAmount ?? 0),
        penaltyAmount: Number(p.penaltyAmount ?? 0),
        paymentMethod: p.paymentMethod,
        paymentStatus: p.paymentStatus,
        paymentDate: p.paidAt,
        notes: p.notes,
        createdAt: p.createdAt,
        isVoided: p.isVoided,
        voidReason: p.voidReason,
        voidedAt: p.voidedAt,
        voidedBy: p.voidedBy,
        referenceNumber: p.referenceNumber,
        invoiceId: p.invoiceId,
        shiftId: p.shiftId,
        refundAmount: Number(p.refundAmount ?? 0),
        refundReason: p.refundReason,
        refundStatus: p.refundStatus,
      }))
    );
  } catch (err) {
    req.log.error(err, "Failed to get payment history");
    res.status(500).json({ error: "Gagal mengambil riwayat pembayaran" });
  }
});

// ─── GET /api/tenant-pos/recent-payments ─────────────────────────────────────
router.get("/tenant-pos/recent-payments", async (req, res) => {
  try {
    const limitParam = Math.min(Number(req.query.limit ?? 20), 50);
    const recentSiteFilter = req.siteId > 0 ? eq(tenantPaymentsTable.siteId, req.siteId) : undefined;
    const rows = await db
      .select({
        id: tenantPaymentsTable.id,
        amount: tenantPaymentsTable.amount,
        discountAmount: tenantPaymentsTable.discountAmount,
        penaltyAmount: tenantPaymentsTable.penaltyAmount,
        paymentMethod: tenantPaymentsTable.paymentMethod,
        receiptNumber: tenantPaymentsTable.receiptNumber,
        referenceNumber: tenantPaymentsTable.referenceNumber,
        notes: tenantPaymentsTable.notes,
        paidAt: tenantPaymentsTable.paidAt,
        isVoided: tenantPaymentsTable.isVoided,
        businessName: tenantsTable.businessName,
        boothNumber: tenantsTable.boothNumber,
        areaName: tenantsTable.areaName,
        periodLabel: tenantBookingsTable.periodLabel,
      })
      .from(tenantPaymentsTable)
      .innerJoin(tenantBookingsTable, eq(tenantPaymentsTable.bookingId, tenantBookingsTable.id))
      .innerJoin(tenantsTable, eq(tenantBookingsTable.tenantId, tenantsTable.id))
      .where(recentSiteFilter)
      .orderBy(desc(tenantPaymentsTable.paidAt))
      .limit(limitParam);

    res.json(rows);
  } catch (err) {
    req.log.error(err, "Failed to get recent payments");
    res.status(500).json({ error: "Gagal mengambil data pembayaran terbaru" });
  }
});

// ─── POST /api/tenant-pos/payments ───────────────────────────────────────────
const paymentBodySchema = z.object({
  bookingId: z.number().int().positive(),
  tenantId: z.number().int().positive(),
  invoiceId: z.number().int().positive().optional(),
  amountPaid: z.number().int().min(1, "amountPaid harus lebih dari 0"),
  discountAmount: z.number().int().min(0).default(0),
  penaltyAmount: z.number().int().min(0).default(0),
  paymentMethod: z.enum(["tunai", "transfer", "qris", "edc", "other"]),
  paymentDate: z.string().optional(),
  referenceNumber: z.string().optional(),
  proofUrl: z.string().optional(),
  shiftId: z.number().int().positive().optional(),
  notes: z.string().optional(),
});

router.post("/tenant-pos/payments", paymentRateLimiter, async (req, res) => {
  const parsed = paymentBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Data tidak valid", detail: parsed.error.flatten().fieldErrors });
    return;
  }

  const {
    bookingId, tenantId, invoiceId, amountPaid, discountAmount,
    penaltyAmount, paymentMethod, paymentDate, referenceNumber,
    proofUrl, shiftId, notes,
  } = parsed.data;

  try {
    const result = await db.transaction(async (tx) => {
      const [booking] = await tx
        .select()
        .from(tenantBookingsTable)
        .where(eq(tenantBookingsTable.id, bookingId))
        .for("update");

      if (!booking) throw Object.assign(new Error("Booking tidak ditemukan"), { status: 404 });
      if (booking.tenantId !== tenantId)
        throw Object.assign(new Error("tenantId tidak cocok dengan booking"), { status: 400 });
      if (booking.paymentStatus === "CANCELLED")
        throw Object.assign(new Error("Booking ini sudah dibatalkan"), { status: 409 });

      const [tenant] = await tx
        .select({ id: tenantsTable.id })
        .from(tenantsTable)
        .where(eq(tenantsTable.id, tenantId));
      if (!tenant) throw Object.assign(new Error("Tenant tidak ditemukan"), { status: 404 });

      const [prevPaid] = await tx
        .select({ total: sql<number>`coalesce(sum(amount::numeric), 0)::int` })
        .from(tenantPaymentsTable)
        .where(
          and(
            eq(tenantPaymentsTable.bookingId, bookingId),
            eq(tenantPaymentsTable.isVoided, false)
          )
        );

      // Fetch invoice BEFORE insert to compute change correctly
      let preInsertInvoice: typeof tenantInvoicesTable.$inferSelect | null = null;
      if (invoiceId) {
        const [inv] = await tx
          .select()
          .from(tenantInvoicesTable)
          .where(eq(tenantInvoicesTable.id, invoiceId))
          .for("update");
        preInsertInvoice = inv ?? null;
      }

      const previousPaidAmount = prevPaid?.total ?? 0;
      const finalBill = Number(booking.totalAmount) - discountAmount + penaltyAmount;
      const newPaidAmount = previousPaidAmount + amountPaid;
      const remainingAmount = Math.max(finalBill - newPaidAmount, 0);
      // When paying a specific invoice, change is relative to invoice outstanding
      const effectiveBill = preInsertInvoice
        ? Number(preInsertInvoice.outstandingAmount) - discountAmount + penaltyAmount
        : finalBill;
      const change = Math.max(amountPaid - effectiveBill, 0);

      let paymentStatus: "PAID" | "PARTIAL" | "UNPAID";
      if (newPaidAmount >= finalBill) paymentStatus = "PAID";
      else if (newPaidAmount > 0) paymentStatus = "PARTIAL";
      else paymentStatus = "UNPAID";

      const receiptNumber = await generateReceiptNumber();
      const paidAt = paymentDate ? new Date(paymentDate) : new Date();

      const [payment] = await tx
        .insert(tenantPaymentsTable)
        .values({
          ...(req.siteId > 0 ? { siteId: req.siteId } : {}),
          siteId: req.siteId > 0 ? req.siteId : undefined,
          bookingId,
          tenantBookingId: bookingId,
          tenantId,
          invoiceId: invoiceId ?? null,
          amount: String(amountPaid),
          discountAmount: String(discountAmount),
          penaltyAmount: String(penaltyAmount),
          paymentMethod,
          paymentStatus: "PAID",
          receiptNumber,
          referenceNumber: referenceNumber ?? null,
          proofUrl: proofUrl ?? null,
          shiftId: shiftId ?? null,
          notes: notes ?? null,
          paidAt,
          isVoided: false,
          refundAmount: "0",
        })
        .returning();

      const [updatedBooking] = await tx
        .update(tenantBookingsTable)
        .set({
          paidAmount: String(newPaidAmount),
          remainingAmount: String(remainingAmount),
          paymentStatus,
          updatedAt: new Date(),
        })
        .where(eq(tenantBookingsTable.id, bookingId))
        .returning();

      if (invoiceId && preInsertInvoice) {
        const [prevInvPaid] = await tx
          .select({ total: sql<number>`coalesce(sum(amount::numeric), 0)::int` })
          .from(tenantPaymentsTable)
          .where(
            and(
              eq(tenantPaymentsTable.invoiceId, invoiceId),
              eq(tenantPaymentsTable.isVoided, false)
            )
          );

        // prevInvPaid already includes the newly inserted payment (same tx)
        const invoicePaid = prevInvPaid?.total ?? 0;
        const invTotal = Number(preInsertInvoice.totalAmount);
        const invOutstanding = Math.max(invTotal - invoicePaid, 0);
        const invStatus = invoicePaid >= invTotal ? "paid" : invoicePaid > 0 ? "partial" : "unpaid";

        await tx
          .update(tenantInvoicesTable)
          .set({
            paidAmount: String(invoicePaid),
            outstandingAmount: String(invOutstanding),
            status: invStatus,
            updatedAt: new Date(),
          })
          .where(eq(tenantInvoicesTable.id, invoiceId));
      }

      if (shiftId && paymentMethod === "tunai") {
        const [shift] = await tx
          .select()
          .from(cashierShiftsTable)
          .where(and(eq(cashierShiftsTable.id, shiftId), eq(cashierShiftsTable.status, "open")));
        if (shift) {
          await tx
            .update(cashierShiftsTable)
            .set({
              expectedCash: sql`${cashierShiftsTable.expectedCash}::numeric + ${amountPaid}`,
              updatedAt: new Date(),
            })
            .where(eq(cashierShiftsTable.id, shiftId));
        }
      }

      return { payment, booking: updatedBooking, paymentStatus, newPaidAmount, remainingAmount, receiptNumber, change };
    });

    logAudit(req, {
      action: "create_payment",
      entityType: "payment",
      entityId: result.payment.id,
      afterData: {
        paymentId: result.payment.id,
        bookingId,
        tenantId,
        amountPaid,
        paymentMethod,
        receiptNumber: result.receiptNumber,
        paymentStatus: result.paymentStatus,
      },
    });
    sseBroker.publish("payment_created", { paymentId: result.payment.id });
    res.status(201).json({
      success: true,
      payment: result.payment,
      receiptNumber: result.receiptNumber,
      paymentStatus: result.paymentStatus,
      paidAmount: result.newPaidAmount,
      remainingAmount: result.remainingAmount,
      change: result.change,
    });
  } catch (err) {
    const e = err as Error & { status?: number };
    if (e.status) {
      res.status(e.status).json({ error: e.message });
    } else {
      logger.error({ err }, "Gagal memproses pembayaran");
      res.status(500).json({ error: "Gagal memproses pembayaran" });
    }
  }
});

// ─── POST /api/tenant-pos/payments/:id/void ──────────────────────────────────
const voidBodySchema = z.object({
  voidReason: z.string().min(3, "Alasan void wajib diisi (min 3 karakter)"),
});

router.post("/tenant-pos/payments/:id/void", paymentRateLimiter, async (req, res) => {
  const currentUser = getSessionUser(req);
  if (!currentUser || !["owner", "admin", "finance"].includes(currentUser.role)) {
    res.status(403).json({ error: "Hanya owner/admin/finance yang dapat melakukan void" });
    return;
  }

  const paymentId = Number(req.params.id);
  if (isNaN(paymentId)) { res.status(400).json({ error: "ID tidak valid" }); return; }

  const parsed = voidBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Data tidak valid", detail: parsed.error.flatten().fieldErrors });
    return;
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [payment] = await tx
        .select()
        .from(tenantPaymentsTable)
        .where(eq(tenantPaymentsTable.id, paymentId))
        .for("update");

      if (!payment) throw Object.assign(new Error("Data pembayaran tidak ditemukan"), { status: 404 });
      if (payment.isVoided) throw Object.assign(new Error("Pembayaran ini sudah di-void"), { status: 409 });

      await tx
        .update(tenantPaymentsTable)
        .set({
          isVoided: true,
          voidedAt: new Date(),
          voidReason: parsed.data.voidReason,
          voidedBy: currentUser.name,
          updatedAt: new Date(),
        })
        .where(eq(tenantPaymentsTable.id, paymentId));

      if (payment.bookingId) {
        const [sumResult] = await tx
          .select({ total: sql<number>`coalesce(sum(amount::numeric), 0)::int` })
          .from(tenantPaymentsTable)
          .where(
            and(
              eq(tenantPaymentsTable.bookingId, payment.bookingId),
              eq(tenantPaymentsTable.isVoided, false)
            )
          );

        const newPaidAmount = sumResult?.total ?? 0;
        const [booking] = await tx
          .select()
          .from(tenantBookingsTable)
          .where(eq(tenantBookingsTable.id, payment.bookingId));

        if (booking) {
          const finalBill = Number(booking.totalAmount);
          const remainingAmount = Math.max(finalBill - newPaidAmount, 0);
          const paymentStatus =
            newPaidAmount >= finalBill ? "PAID" : newPaidAmount > 0 ? "PARTIAL" : "UNPAID";
          await tx
            .update(tenantBookingsTable)
            .set({ paidAmount: String(newPaidAmount), remainingAmount: String(remainingAmount), paymentStatus, updatedAt: new Date() })
            .where(eq(tenantBookingsTable.id, payment.bookingId));
        }
      }

      if (payment.invoiceId) {
        const [invSum] = await tx
          .select({ total: sql<number>`coalesce(sum(amount::numeric), 0)::int` })
          .from(tenantPaymentsTable)
          .where(
            and(
              eq(tenantPaymentsTable.invoiceId, payment.invoiceId),
              eq(tenantPaymentsTable.isVoided, false)
            )
          );

        const invPaid = invSum?.total ?? 0;
        const [invoice] = await tx
          .select()
          .from(tenantInvoicesTable)
          .where(eq(tenantInvoicesTable.id, payment.invoiceId));

        if (invoice) {
          const invTotal = Number(invoice.totalAmount);
          const invOutstanding = Math.max(invTotal - invPaid, 0);
          const invStatus = invPaid >= invTotal ? "paid" : invPaid > 0 ? "partial" : "unpaid";
          await tx
            .update(tenantInvoicesTable)
            .set({ paidAmount: String(invPaid), outstandingAmount: String(invOutstanding), status: invStatus, updatedAt: new Date() })
            .where(eq(tenantInvoicesTable.id, payment.invoiceId));
        }
      }

      return payment;
    });

    logAudit(req, {
      action: "void_payment",
      entityType: "payment",
      entityId: result.id,
      beforeData: { id: result.id, isVoided: false, amount: result.amount },
      afterData: { id: result.id, isVoided: true, voidReason: parsed.data.voidReason },
    });
    sseBroker.publish("payment_voided", { paymentId: result.id });
    res.json({ success: true, message: "Pembayaran berhasil di-void", paymentId: result.id, isVoided: true });
  } catch (err) {
    const e = err as Error & { status?: number };
    if (e.status) res.status(e.status).json({ error: e.message });
    else { logger.error({ err }, "Gagal melakukan void pembayaran"); res.status(500).json({ error: "Gagal melakukan void pembayaran" }); }
  }
});

// ─── POST /api/tenant-pos/payments/:id/refund ────────────────────────────────
const refundBodySchema = z.object({
  refundAmount: z.number().int().min(1, "Jumlah refund harus lebih dari 0"),
  refundReason: z.string().min(3, "Alasan refund wajib diisi"),
});

router.post("/tenant-pos/payments/:id/refund", paymentRateLimiter, async (req, res) => {
  const currentUser = getSessionUser(req);
  if (!currentUser || !["owner", "admin", "finance"].includes(currentUser.role)) {
    res.status(403).json({ error: "Hanya owner/admin/finance yang dapat melakukan refund" });
    return;
  }

  const paymentId = Number(req.params.id);
  if (isNaN(paymentId)) { res.status(400).json({ error: "ID tidak valid" }); return; }

  const parsed = refundBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Data tidak valid", detail: parsed.error.flatten().fieldErrors });
    return;
  }

  try {
    const [payment] = await db
      .select()
      .from(tenantPaymentsTable)
      .where(eq(tenantPaymentsTable.id, paymentId));

    if (!payment) { res.status(404).json({ error: "Data pembayaran tidak ditemukan" }); return; }
    if (payment.isVoided) { res.status(409).json({ error: "Pembayaran ini sudah di-void" }); return; }
    if (payment.refundStatus === "processed") { res.status(409).json({ error: "Pembayaran ini sudah di-refund" }); return; }
    if (parsed.data.refundAmount > Number(payment.amount)) {
      res.status(400).json({ error: "Jumlah refund tidak boleh melebihi nominal bayar" }); return;
    }

    await db
      .update(tenantPaymentsTable)
      .set({ refundAmount: String(parsed.data.refundAmount), refundReason: parsed.data.refundReason, refundStatus: "processed", updatedAt: new Date() })
      .where(eq(tenantPaymentsTable.id, paymentId));

    logAudit(req, {
      action: "refund_payment",
      entityType: "payment",
      entityId: paymentId,
      beforeData: { id: paymentId, refundAmount: 0, refundStatus: payment.refundStatus },
      afterData: { id: paymentId, refundAmount: parsed.data.refundAmount, refundReason: parsed.data.refundReason, refundStatus: "processed" },
    });
    res.json({ success: true, message: "Refund berhasil dicatat" });
  } catch (err) {
    logger.error({ err }, "Gagal melakukan refund");
    res.status(500).json({ error: "Gagal melakukan refund" });
  }
});

// ─── GET /api/tenant-pos/payments/:paymentId/receipt ─────────────────────────
router.get("/tenant-pos/payments/:paymentId/receipt", async (req, res) => {
  const paymentId = Number(req.params.paymentId);
  if (isNaN(paymentId)) { res.status(400).json({ error: "ID tidak valid" }); return; }
  try {
    const [row] = await db
      .select({
        paymentId: tenantPaymentsTable.id,
        receiptNumber: tenantPaymentsTable.receiptNumber,
        paymentDate: tenantPaymentsTable.paidAt,
        amountPaid: tenantPaymentsTable.amount,
        discountAmount: tenantPaymentsTable.discountAmount,
        penaltyAmount: tenantPaymentsTable.penaltyAmount,
        paymentMethod: tenantPaymentsTable.paymentMethod,
        paymentStatus: tenantPaymentsTable.paymentStatus,
        referenceNumber: tenantPaymentsTable.referenceNumber,
        invoiceId: tenantPaymentsTable.invoiceId,
        shiftId: tenantPaymentsTable.shiftId,
        notes: tenantPaymentsTable.notes,
        isVoided: tenantPaymentsTable.isVoided,
        billingPeriod: tenantBookingsTable.periodLabel,
        totalAmount: tenantBookingsTable.totalAmount,
        remainingAmount: tenantBookingsTable.remainingAmount,
        businessName: tenantsTable.businessName,
        ownerName: tenantsTable.ownerName,
        boothNumber: tenantsTable.boothNumber,
        areaName: tenantsTable.areaName,
      })
      .from(tenantPaymentsTable)
      .innerJoin(tenantBookingsTable, eq(tenantPaymentsTable.bookingId, tenantBookingsTable.id))
      .innerJoin(tenantsTable, eq(tenantBookingsTable.tenantId, tenantsTable.id))
      .where(eq(tenantPaymentsTable.id, paymentId));

    if (!row) { res.status(404).json({ error: "Data pembayaran tidak ditemukan" }); return; }

    let invoiceNumber: string | null = null;
    if (row.invoiceId) {
      const [inv] = await db
        .select({ invoiceNumber: tenantInvoicesTable.invoiceNumber })
        .from(tenantInvoicesTable)
        .where(eq(tenantInvoicesTable.id, row.invoiceId));
      invoiceNumber = inv?.invoiceNumber ?? null;
    }

    let cashierName = "Admin";
    if (row.shiftId) {
      const [shift] = await db
        .select({ cashierName: cashierShiftsTable.cashierName })
        .from(cashierShiftsTable)
        .where(eq(cashierShiftsTable.id, row.shiftId));
      if (shift) cashierName = shift.cashierName;
    }

    res.json({
      receiptNumber: row.receiptNumber ?? `PAY-${paymentId}`,
      paymentDate: row.paymentDate,
      businessName: row.businessName,
      ownerName: row.ownerName,
      boothNumber: row.boothNumber,
      billingPeriod: row.billingPeriod ?? "—",
      totalAmount: Number(row.totalAmount),
      discountAmount: Number(row.discountAmount ?? 0),
      penaltyAmount: Number(row.penaltyAmount ?? 0),
      amountPaid: Number(row.amountPaid),
      remainingAmount: Number(row.remainingAmount ?? 0),
      paymentMethod: row.paymentMethod,
      paymentStatus: row.paymentStatus,
      referenceNumber: row.referenceNumber ?? null,
      invoiceNumber,
      cashierName,
      isVoided: row.isVoided,
      notes: row.notes ?? null,
    });
  } catch (err) {
    req.log.error(err, "Failed to get payment receipt");
    res.status(500).json({ error: "Gagal mengambil data receipt" });
  }
});

// ─── GET /api/tenant-pos/shifts/current ──────────────────────────────────────
router.get("/tenant-pos/shifts/current", async (req, res) => {
  try {
    const [shift] = await db
      .select()
      .from(cashierShiftsTable)
      .where(eq(cashierShiftsTable.status, "open"))
      .orderBy(desc(cashierShiftsTable.openedAt))
      .limit(1);

    if (!shift) { res.json(null); return; }

    const [txCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tenantPaymentsTable)
      .where(and(eq(tenantPaymentsTable.shiftId, shift.id), eq(tenantPaymentsTable.isVoided, false)));

    const [txTotal] = await db
      .select({ total: sql<number>`coalesce(sum(amount::numeric), 0)::int` })
      .from(tenantPaymentsTable)
      .where(and(eq(tenantPaymentsTable.shiftId, shift.id), eq(tenantPaymentsTable.isVoided, false)));

    res.json({
      id: shift.id,
      cashierName: shift.cashierName,
      cashierId: shift.cashierId,
      openedAt: shift.openedAt,
      closedAt: shift.closedAt,
      expectedCash: Number(shift.expectedCash),
      actualCash: shift.actualCash !== null ? Number(shift.actualCash) : null,
      cashDifference: shift.cashDifference !== null ? Number(shift.cashDifference) : null,
      notes: shift.notes,
      status: shift.status,
      transactionCount: txCount?.count ?? 0,
      transactionTotal: txTotal?.total ?? 0,
    });
  } catch (err) {
    req.log.error(err, "Failed to get current shift");
    res.status(500).json({ error: "Gagal mengambil data shift" });
  }
});

// ─── POST /api/tenant-pos/shifts/open ────────────────────────────────────────
const openShiftSchema = z.object({
  cashierName: z.string().min(2, "Nama kasir wajib diisi"),
  notes: z.string().optional(),
});

router.post("/tenant-pos/shifts/open", async (req, res) => {
  const parsed = openShiftSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Data tidak valid", detail: parsed.error.flatten().fieldErrors });
    return;
  }

  try {
    const [existing] = await db
      .select({ id: cashierShiftsTable.id })
      .from(cashierShiftsTable)
      .where(eq(cashierShiftsTable.status, "open"))
      .limit(1);

    if (existing) {
      res.status(409).json({ error: "Masih ada shift yang aktif, tutup terlebih dahulu" });
      return;
    }

    const currentUser = getSessionUser(req);
    const [shift] = await db
      .insert(cashierShiftsTable)
      .values({
        ...(req.siteId > 0 ? { siteId: req.siteId } : {}),
        cashierName: parsed.data.cashierName,
        cashierId: currentUser?.dbId ?? null,
        notes: parsed.data.notes ?? null,
        status: "open",
        expectedCash: "0",
      })
      .returning();

    res.status(201).json(shift);
  } catch (err) {
    logger.error({ err }, "Gagal membuka shift");
    res.status(500).json({ error: "Gagal membuka shift" });
  }
});

// ─── POST /api/tenant-pos/shifts/:id/close ───────────────────────────────────
const closeShiftSchema = z.object({
  actualCash: z.number().int().min(0),
  notes: z.string().optional(),
});

router.post("/tenant-pos/shifts/:id/close", async (req, res) => {
  const shiftId = Number(req.params.id);
  if (isNaN(shiftId)) { res.status(400).json({ error: "ID tidak valid" }); return; }

  const parsed = closeShiftSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Data tidak valid", detail: parsed.error.flatten().fieldErrors });
    return;
  }

  try {
    const [shift] = await db
      .select()
      .from(cashierShiftsTable)
      .where(and(eq(cashierShiftsTable.id, shiftId), eq(cashierShiftsTable.status, "open")));

    if (!shift) { res.status(404).json({ error: "Shift tidak ditemukan atau sudah ditutup" }); return; }

    // Recompute expected cash from non-voided cash payments in this shift
    const [cashSum] = await db
      .select({ total: sql<string>`coalesce(sum(amount::numeric), 0)` })
      .from(tenantPaymentsTable)
      .where(
        and(
          eq(tenantPaymentsTable.shiftId, shiftId),
          eq(tenantPaymentsTable.isVoided, false),
          sql`lower(${tenantPaymentsTable.paymentMethod}) = 'tunai'`,
        ),
      );
    const expectedCash = Number(cashSum?.total ?? "0");
    const actualCash = parsed.data.actualCash;
    const cashDifference = actualCash - expectedCash;

    const [updated] = await db
      .update(cashierShiftsTable)
      .set({
        status: "closed",
        closedAt: new Date(),
        expectedCash: String(expectedCash),
        actualCash: String(actualCash),
        cashDifference: String(cashDifference),
        notes: parsed.data.notes ?? shift.notes,
        updatedAt: new Date(),
      })
      .where(eq(cashierShiftsTable.id, shiftId))
      .returning();

    const [txCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tenantPaymentsTable)
      .where(and(eq(tenantPaymentsTable.shiftId, shiftId), eq(tenantPaymentsTable.isVoided, false)));

    const [txTotal] = await db
      .select({ total: sql<number>`coalesce(sum(amount::numeric), 0)::int` })
      .from(tenantPaymentsTable)
      .where(and(eq(tenantPaymentsTable.shiftId, shiftId), eq(tenantPaymentsTable.isVoided, false)));

    res.json({
      shift: updated,
      summary: { transactionCount: txCount?.count ?? 0, transactionTotal: txTotal?.total ?? 0, expectedCash, actualCash, cashDifference },
    });
  } catch (err) {
    logger.error({ err }, "Gagal menutup shift");
    res.status(500).json({ error: "Gagal menutup shift" });
  }
});

// ─── GET /api/tenant-pos/daily-report ────────────────────────────────────────
router.get("/tenant-pos/daily-report", async (req, res) => {
  try {
    const dateParam = (req.query.date as string) ?? new Date().toISOString().slice(0, 10);

    const dailySiteFilter = req.siteId > 0 ? eq(tenantPaymentsTable.siteId, req.siteId) : undefined;
    const payments = await db
      .select({
        id: tenantPaymentsTable.id,
        amount: tenantPaymentsTable.amount,
        paymentMethod: tenantPaymentsTable.paymentMethod,
        receiptNumber: tenantPaymentsTable.receiptNumber,
        paidAt: tenantPaymentsTable.paidAt,
        isVoided: tenantPaymentsTable.isVoided,
        businessName: tenantsTable.businessName,
        boothNumber: tenantsTable.boothNumber,
      })
      .from(tenantPaymentsTable)
      .innerJoin(tenantBookingsTable, eq(tenantPaymentsTable.bookingId, tenantBookingsTable.id))
      .innerJoin(tenantsTable, eq(tenantBookingsTable.tenantId, tenantsTable.id))
      .where(and(sql`${tenantPaymentsTable.paidAt}::date = ${dateParam}`, dailySiteFilter))
      .orderBy(tenantPaymentsTable.paidAt);

    const valid = payments.filter((p) => !p.isVoided);
    const totalAmount = valid.reduce((sum, p) => sum + Number(p.amount), 0);
    const byMethod: Record<string, number> = {};
    for (const p of valid) {
      byMethod[p.paymentMethod ?? "other"] = (byMethod[p.paymentMethod ?? "other"] ?? 0) + Number(p.amount);
    }

    res.json({
      date: dateParam,
      totalAmount,
      totalCount: valid.length,
      voidedCount: payments.filter((p) => p.isVoided).length,
      byMethod,
      payments: payments.map((p) => ({ ...p, amount: Number(p.amount) })),
    });
  } catch (err) {
    req.log.error(err, "Failed to get daily report");
    res.status(500).json({ error: "Gagal mengambil laporan harian" });
  }
});

// ─── GET /api/tenant-pos/shifts/:id/report ───────────────────────────────────
router.get("/tenant-pos/shifts/:id/report", async (req, res) => {
  const shiftId = Number(req.params.id);
  if (isNaN(shiftId)) { res.status(400).json({ error: "ID tidak valid" }); return; }

  try {
    const [shift] = await db
      .select()
      .from(cashierShiftsTable)
      .where(eq(cashierShiftsTable.id, shiftId));

    if (!shift) { res.status(404).json({ error: "Shift tidak ditemukan" }); return; }

    const payments = await db
      .select({
        id: tenantPaymentsTable.id,
        amount: tenantPaymentsTable.amount,
        paymentMethod: tenantPaymentsTable.paymentMethod,
        receiptNumber: tenantPaymentsTable.receiptNumber,
        referenceNumber: tenantPaymentsTable.referenceNumber,
        paidAt: tenantPaymentsTable.paidAt,
        isVoided: tenantPaymentsTable.isVoided,
        businessName: tenantsTable.businessName,
        boothNumber: tenantsTable.boothNumber,
      })
      .from(tenantPaymentsTable)
      .leftJoin(tenantBookingsTable, eq(tenantPaymentsTable.bookingId, tenantBookingsTable.id))
      .leftJoin(tenantsTable, eq(tenantBookingsTable.tenantId, tenantsTable.id))
      .where(eq(tenantPaymentsTable.shiftId, shiftId))
      .orderBy(tenantPaymentsTable.paidAt);

    const valid = payments.filter((p) => !p.isVoided);
    const totalAmount = valid.reduce((sum, p) => sum + Number(p.amount), 0);
    const byMethod: Record<string, number> = {};
    for (const p of valid) {
      byMethod[p.paymentMethod ?? "other"] = (byMethod[p.paymentMethod ?? "other"] ?? 0) + Number(p.amount);
    }
    const expectedCash = valid
      .filter((p) => (p.paymentMethod ?? "").toLowerCase() === "tunai")
      .reduce((sum, p) => sum + Number(p.amount), 0);

    res.json({
      shift,
      totalAmount,
      totalCount: valid.length,
      voidedCount: payments.filter((p) => p.isVoided).length,
      byMethod,
      expectedCash,
      payments: payments.map((p) => ({ ...p, amount: Number(p.amount) })),
    });
  } catch (err) {
    logger.error({ err }, "Gagal mengambil laporan shift");
    res.status(500).json({ error: "Gagal mengambil laporan shift" });
  }
});

export default router;
