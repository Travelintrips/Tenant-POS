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
  paymentReceiptsTable,
} from "@workspace/db/schema";
import { eq, and, sql, desc, gte, lte, ilike, or } from "drizzle-orm";
import { z } from "zod";
import { requireAnyRole } from "../middlewares/auth";
import { logAudit } from "../lib/audit";
import { sseBroker } from "../lib/sse-broker";
import { writePaymentEvent, normalizePaymentMethod } from "../lib/payment-events";
import { generateReceiptHtml, saveReceiptFile } from "../lib/pos-receipt";
import { postPosPaymentJournal } from "../lib/pos-journal";
import { sendPosPaymentSuccess, getSiteCompanyName } from "../lib/whatsapp";
import { recordPayment, LedgerError } from "../lib/payment-ledger";
import { getBaseUrl } from "../lib/app-url";

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

// ─── GET /api/tenant-pos/tenants/:tenantId/payments ──────────────────────────
router.get("/tenant-pos/tenants/:tenantId/payments", async (req, res) => {
  const tenantId = Number(req.params.tenantId);
  if (isNaN(tenantId)) {
    res.status(400).json({ error: "ID tidak valid" });
    return;
  }
  try {
    const siteFilter = req.siteId > 0 ? eq(tenantPaymentsTable.siteId, req.siteId) : undefined;
    const payments = await db
      .select()
      .from(tenantPaymentsTable)
      .where(and(eq(tenantPaymentsTable.tenantId, tenantId), siteFilter))
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
        bookingId: p.bookingId,
        shiftId: p.shiftId,
        refundAmount: Number(p.refundAmount ?? 0),
        refundReason: p.refundReason,
        refundStatus: p.refundStatus,
        isManual: p.bookingId === null,
      }))
    );
  } catch (err) {
    req.log.error(err, "Failed to get tenant payment history");
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
        .select({
          id: tenantsTable.id,
          businessName: tenantsTable.businessName,
          ownerName: tenantsTable.ownerName,
          phone: tenantsTable.phone,
          boothNumber: tenantsTable.boothNumber,
        })
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

      // For invoice ledger: clamp to effectiveBill so overpayment is prevented
      // (excess = kembalian/change, tracked separately)
      const appliedAmount = invoiceId ? Math.min(amountPaid, Math.max(effectiveBill, 0)) : amountPaid;
      const posReferenceId = `POS-${shiftId ?? "ns"}-${receiptNumber}`;

      let payment: {
        id: number;
        receiptNumber: string | null;
        paymentMethod?: string | null;
        siteId?: number | null;
        invoiceId?: number | null;
        paidAt?: Date | string | null;
        [key: string]: unknown;
      };

      if (invoiceId) {
        // Route all invoice payments through PaymentLedgerService
        const ledger = await recordPayment(tx, {
          invoiceId,
          amount: appliedAmount,
          paymentMethod,
          sourceType: "pos",
          receiptNumber,
          referenceId: posReferenceId,
          referenceNumber: referenceNumber ?? null,
          discountAmount,
          penaltyAmount,
          proofUrl: proofUrl ?? null,
          shiftId: shiftId ?? null,
          notes: notes ?? null,
          paidAt,
          tenantId,
          bookingId,
          siteId: req.siteId > 0 ? req.siteId : null,
        });
        payment = { id: ledger.ledgerEntryId, receiptNumber, paymentMethod };
      } else {
        // No invoice — direct booking-only payment (out of scope for ledger engine)
        const [inserted] = await tx
          .insert(tenantPaymentsTable)
          .values({
            siteId: req.siteId > 0 ? req.siteId : undefined,
            bookingId,
            tenantBookingId: bookingId,
            tenantId,
            invoiceId: null,
            amount: String(amountPaid),
            discountAmount: String(discountAmount),
            penaltyAmount: String(penaltyAmount),
            paymentMethod,
            method: paymentMethod,
            paymentStatus: "PAID",
            status: "PAID",
            approvalStatus: "approved",
            receiptNumber,
            paymentNumber: receiptNumber,
            referenceNumber: referenceNumber ?? null,
            referenceId: posReferenceId,
            sourceType: "pos",
            proofUrl: proofUrl ?? null,
            shiftId: shiftId ?? null,
            notes: notes ?? null,
            paidAt,
            isVoided: false,
            refundAmount: "0",
          })
          .returning();
        payment = inserted as typeof payment;
      }

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

      return {
        payment,
        booking: updatedBooking,
        paymentStatus,
        newPaidAmount,
        remainingAmount,
        receiptNumber,
        change,
        preInsertInvoice,
        tenantData: {
          businessName: tenant.businessName,
          ownerName: tenant.ownerName,
          phone: tenant.phone ?? null,
          boothNumber: tenant.boothNumber ?? null,
          periodLabel: booking.periodLabel ?? null,
        },
      };
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

    writePaymentEvent({
      sourceApp: "tenant_pos",
      ownerApp: "tenant_management",
      sourceModule: "pos_sale",
      sourceTable: "tenant_payments",
      sourceId: result.payment.id,
      ownerTenantId: tenantId ?? null,
      tenantId: tenantId ?? null,
      siteId: (result.payment.siteId as number | null) ?? null,
      invoiceId: (result.payment.invoiceId as number | null) ?? null,
      amount: amountPaid,
      direction: "IN",
      paymentMethod: normalizePaymentMethod(paymentMethod),
      paymentReference: referenceNumber ?? null,
      paymentStatus: paymentMethod === "transfer" ? "waiting_confirmation" : "confirmed",
      proofUrl: proofUrl ?? null,
      metadata: {
        receiptNumber: result.receiptNumber,
        bookingId,
        paymentStatus: result.paymentStatus,
        source: "pos_payment",
      },
    }).catch(() => {});

    // ── Post-payment: Journal → Receipt → WhatsApp (fire-and-forget, non-blocking) ──
    const paymentId = result.payment.id;
    const siteId = (result.payment.siteId as number | null) ?? null;
    const kasirName = getSessionUser(req)?.name ?? "Kasir";
    const invoiceNumber = result.preInsertInvoice?.invoiceNumber ?? null;
    const paidAt = (result.payment.paidAt as Date | null) ?? new Date();

    // Fetch tenant info for WA + receipt (do this async)
    void (async () => {
      try {
        // 1. Posting jurnal akuntansi (CRITICAL — harus sukses)
        const journalResult = await postPosPaymentJournal({
          paymentId,
          tenantId,
          invoiceId: invoiceId ?? null,
          invoiceNumber,
          businessName: result.tenantData?.businessName ?? null,
          amountPaid,
          paymentMethod,
          transactionDate: new Date(paidAt),
          kasirName,
          siteId,
          receiptNumber: result.receiptNumber,
        });
        if (journalResult.alreadyPosted) {
          logger.info({ paymentId, journalId: journalResult.journalId }, "[pos] Jurnal sudah ada, dilewati");
        }

        // 2. Generate dan simpan receipt HTML
        let receiptUrl: string | null = null;
        try {
          const receiptHtml = generateReceiptHtml({
            receiptNumber: result.receiptNumber,
            invoiceNumber,
            businessName: result.tenantData?.businessName ?? "Tenant",
            ownerName: result.tenantData?.ownerName ?? "",
            unitCode: result.tenantData?.boothNumber ?? null,
            periodLabel: result.tenantData?.periodLabel ?? null,
            amountPaid,
            netAmount: journalResult.netAmount,
            taxAmount: journalResult.taxAmount,
            discountAmount,
            penaltyAmount,
            paymentMethod,
            kasirName,
            paidAt: new Date(paidAt),
            journalId: journalResult.journalId,
          });
          const saved = await saveReceiptFile(result.receiptNumber, receiptHtml);
          receiptUrl = saved.fileUrl;
        } catch (receiptErr) {
          logger.error({ err: receiptErr, paymentId }, "[pos] Gagal generate receipt — dilanjutkan");
        }

        // 3. Simpan record receipt ke DB
        let waStatus = "skipped";
        let waError: string | null = null;

        try {
          await db.insert(paymentReceiptsTable).values({
            paymentId,
            invoiceId: invoiceId ?? null,
            tenantId,
            siteId,
            receiptNumber: result.receiptNumber,
            fileUrl: receiptUrl ?? "",
            invoiceNumber,
            businessName: result.tenantData?.businessName ?? null,
            ownerName: result.tenantData?.ownerName ?? null,
            unitCode: result.tenantData?.boothNumber ?? null,
            amountPaid: String(amountPaid),
            taxAmount: String(journalResult.taxAmount),
            netAmount: String(journalResult.netAmount),
            paymentMethod,
            kasirName,
            journalId: journalResult.journalId,
            waStatus: "pending",
          });
        } catch (dbErr) {
          logger.error({ err: dbErr, paymentId }, "[pos] Gagal simpan record receipt");
        }

        // 4. Kirim WhatsApp ke tenant (jika ada nomor HP)
        const tenantPhone = result.tenantData?.phone ?? null;
        if (tenantPhone) {
          try {
            const baseUrl = await getBaseUrl();
            const fullReceiptUrl = receiptUrl && baseUrl ? `${baseUrl}${receiptUrl}` : null;
            const posCompanyName = await getSiteCompanyName(siteId);
            const waResult = await sendPosPaymentSuccess({
              ownerName: result.tenantData?.ownerName ?? "Tenant",
              businessName: result.tenantData?.businessName ?? "Tenant",
              invoiceNumber,
              amountPaid,
              paymentMethod,
              receiptNumber: result.receiptNumber,
              receiptUrl: fullReceiptUrl,
              phone: tenantPhone,
              companyName: posCompanyName,
            });
            waStatus = waResult.ok ? (waResult.skipped ? "skipped" : "sent") : "failed";
            waError = waResult.error ?? null;
          } catch (waErr) {
            waStatus = "failed";
            waError = waErr instanceof Error ? waErr.message : String(waErr);
            logger.error({ err: waErr, paymentId }, "[pos] Gagal kirim WA — payment tetap sukses");
          }
        }

        // Update waStatus di DB
        try {
          await db
            .update(paymentReceiptsTable)
            .set({ waStatus, waError })
            .where(eq(paymentReceiptsTable.receiptNumber, result.receiptNumber));
        } catch {
          // Non-critical
        }

        logger.info(
          { paymentId, journalId: journalResult.journalId, receiptUrl, waStatus },
          "[pos] Post-payment processing selesai",
        );
      } catch (postErr) {
        logger.error({ err: postErr, paymentId }, "[pos] Gagal post-payment processing");
      }
    })();

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
    if (err instanceof LedgerError) {
      const httpCode = err.code === "OVERPAYMENT" ? 400 : 409;
      res.status(httpCode).json({ error: err.message, code: err.code });
      return;
    }
    const e = err as Error & { status?: number };
    if (e.status) {
      res.status(e.status).json({ error: e.message });
    } else {
      logger.error({ err }, "Gagal memproses pembayaran");
      res.status(500).json({ error: "Gagal memproses pembayaran" });
    }
  }
});

// ─── POST /api/tenant-pos/manual-payment ─────────────────────────────────────
// Pembayaran manual (tunai/transfer) tanpa booking — langsung ke tenant
const manualPaymentSchema = z.object({
  tenantId: z.number().int().positive(),
  amountPaid: z.number().int().min(1, "Nominal harus lebih dari 0"),
  paymentMethod: z.enum(["tunai", "transfer", "qris", "edc", "other"]),
  paymentDate: z.string().optional(),
  referenceNumber: z.string().optional(),
  proofUrl: z.string().optional(),
  notes: z.string().optional(),
  shiftId: z.number().int().positive().optional(),
});

router.post("/tenant-pos/manual-payment", paymentRateLimiter, async (req, res) => {
  const parsed = manualPaymentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Data tidak valid", detail: parsed.error.flatten().fieldErrors });
    return;
  }

  const { tenantId, amountPaid, paymentMethod, paymentDate, referenceNumber, proofUrl, notes, shiftId } = parsed.data;

  try {
    const [tenant] = await db
      .select({ id: tenantsTable.id, businessName: tenantsTable.businessName, ownerName: tenantsTable.ownerName, phone: tenantsTable.phone, boothNumber: tenantsTable.boothNumber })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, tenantId));

    if (!tenant) { res.status(404).json({ error: "Tenant tidak ditemukan" }); return; }

    const receiptNumber = await generateReceiptNumber();
    const paidAt = paymentDate ? new Date(paymentDate) : new Date();
    const siteId = req.siteId > 0 ? req.siteId : null;
    const posReferenceId = `POS-MANUAL-${receiptNumber}`;

    const [inserted] = await db
      .insert(tenantPaymentsTable)
      .values({
        siteId: siteId ?? undefined,
        bookingId: null,
        tenantBookingId: null,
        tenantId,
        invoiceId: null,
        amount: String(amountPaid),
        discountAmount: "0",
        penaltyAmount: "0",
        paymentMethod,
        method: paymentMethod,
        paymentStatus: "PAID",
        status: "PAID",
        approvalStatus: "approved",
        receiptNumber,
        referenceNumber: referenceNumber ?? null,
        referenceId: posReferenceId,
        sourceType: "pos",
        proofUrl: proofUrl ?? null,
        shiftId: shiftId ?? null,
        notes: notes ?? null,
        paidAt,
        isVoided: false,
        refundAmount: "0",
      })
      .returning();

    if (shiftId && paymentMethod === "tunai") {
      const [shift] = await db.select().from(cashierShiftsTable).where(and(eq(cashierShiftsTable.id, shiftId), eq(cashierShiftsTable.status, "open")));
      if (shift) {
        await db.update(cashierShiftsTable).set({ expectedCash: sql`${cashierShiftsTable.expectedCash}::numeric + ${amountPaid}`, updatedAt: new Date() }).where(eq(cashierShiftsTable.id, shiftId));
      }
    }

    logAudit(req, { action: "create_manual_payment", entityType: "payment", entityId: inserted.id, afterData: { paymentId: inserted.id, tenantId, amountPaid, paymentMethod, receiptNumber } });
    sseBroker.publish("payment_created", { paymentId: inserted.id });

    writePaymentEvent({
      sourceApp: "tenant_pos", ownerApp: "tenant_management", sourceModule: "pos_manual", sourceTable: "tenant_payments",
      sourceId: inserted.id, ownerTenantId: tenantId, tenantId, siteId,
      invoiceId: null, amount: amountPaid, direction: "IN",
      paymentMethod: normalizePaymentMethod(paymentMethod),
      paymentReference: referenceNumber ?? null,
      paymentStatus: paymentMethod === "transfer" ? "waiting_confirmation" : "confirmed",
      proofUrl: null,
      metadata: { receiptNumber, source: "manual_payment" },
    }).catch(() => {});

    const kasirName = getSessionUser(req)?.name ?? "Kasir";
    const paymentId = inserted.id;

    void (async () => {
      try {
        const journalResult = await postPosPaymentJournal({
          paymentId, tenantId, invoiceId: null, invoiceNumber: null,
          businessName: tenant.businessName ?? null,
          amountPaid, paymentMethod,
          transactionDate: new Date(paidAt),
          kasirName, siteId, receiptNumber,
        });

        let receiptUrl: string | null = null;
        try {
          const receiptHtml = generateReceiptHtml({
            receiptNumber, invoiceNumber: null,
            businessName: tenant.businessName ?? "Tenant",
            ownerName: tenant.ownerName ?? "",
            unitCode: tenant.boothNumber ?? null,
            periodLabel: null,
            amountPaid, netAmount: journalResult.netAmount, taxAmount: journalResult.taxAmount,
            discountAmount: 0, penaltyAmount: 0,
            paymentMethod, kasirName, paidAt: new Date(paidAt), journalId: journalResult.journalId,
          });
          const saved = await saveReceiptFile(receiptNumber, receiptHtml);
          receiptUrl = saved.fileUrl;
        } catch (receiptErr) {
          logger.error({ err: receiptErr, paymentId }, "[pos-manual] Gagal generate receipt");
        }

        try {
          await db.insert(paymentReceiptsTable).values({
            paymentId, invoiceId: null, tenantId, siteId, receiptNumber,
            fileUrl: receiptUrl ?? "",
            invoiceNumber: null,
            businessName: tenant.businessName ?? null,
            ownerName: tenant.ownerName ?? null,
            unitCode: tenant.boothNumber ?? null,
            amountPaid: String(amountPaid), taxAmount: String(journalResult.taxAmount), netAmount: String(journalResult.netAmount),
            paymentMethod, kasirName, journalId: journalResult.journalId, waStatus: "pending",
          });
        } catch (dbErr) {
          logger.error({ err: dbErr, paymentId }, "[pos-manual] Gagal simpan record receipt");
        }

        if (tenant.phone) {
          try {
            const baseUrl = await getBaseUrl();
            const fullReceiptUrl = receiptUrl && baseUrl ? `${baseUrl}${receiptUrl}` : null;
            const manualCompanyName = await getSiteCompanyName(req.siteId);
            await sendPosPaymentSuccess({ ownerName: tenant.ownerName ?? "Tenant", businessName: tenant.businessName ?? "Tenant", invoiceNumber: null, amountPaid, paymentMethod, receiptNumber, receiptUrl: fullReceiptUrl, phone: tenant.phone, companyName: manualCompanyName });
          } catch (waErr) {
            logger.error({ err: waErr, paymentId }, "[pos-manual] Gagal kirim WA");
          }
        }
      } catch (postErr) {
        logger.error({ err: postErr, paymentId }, "[pos-manual] Gagal post-payment processing");
      }
    })();

    res.status(201).json({ success: true, payment: inserted, receiptNumber, paymentStatus: "PAID", paidAmount: amountPaid, remainingAmount: 0, change: 0 });
  } catch (err) {
    logger.error({ err }, "Gagal memproses pembayaran manual");
    res.status(500).json({ error: "Gagal memproses pembayaran manual" });
  }
});

// ─── GET /api/tenant-pos/receipts/:paymentId ─────────────────────────────────
router.get("/tenant-pos/receipts/:paymentId", async (req, res) => {
  const paymentId = Number(req.params.paymentId);
  if (isNaN(paymentId)) { res.status(400).json({ error: "ID tidak valid" }); return; }

  try {
    const [receipt] = await db
      .select()
      .from(paymentReceiptsTable)
      .where(eq(paymentReceiptsTable.paymentId, paymentId))
      .limit(1);

    if (!receipt) {
      res.status(404).json({ error: "Receipt belum tersedia" });
      return;
    }

    res.json({
      id: receipt.id,
      paymentId: receipt.paymentId,
      receiptNumber: receipt.receiptNumber,
      fileUrl: receipt.fileUrl,
      invoiceNumber: receipt.invoiceNumber,
      businessName: receipt.businessName,
      amountPaid: Number(receipt.amountPaid),
      taxAmount: Number(receipt.taxAmount),
      netAmount: Number(receipt.netAmount),
      journalId: receipt.journalId,
      waStatus: receipt.waStatus,
      createdAt: receipt.createdAt,
    });
  } catch (err) {
    req.log.error(err, "Failed to get receipt");
    res.status(500).json({ error: "Gagal mengambil data receipt" });
  }
});

// ─── GET /api/tenant-pos/receipts (list with filters) ────────────────────────
router.get("/tenant-pos/receipts", async (req, res) => {
  const { dateFrom, dateTo, waStatus, search, siteId, limit = "50", offset = "0" } = req.query as Record<string, string>;

  const conditions = [];

  if (dateFrom) {
    const d = new Date(dateFrom);
    if (!isNaN(d.getTime())) conditions.push(gte(paymentReceiptsTable.createdAt, d));
  }
  if (dateTo) {
    const d = new Date(dateTo);
    if (!isNaN(d.getTime())) {
      d.setHours(23, 59, 59, 999);
      conditions.push(lte(paymentReceiptsTable.createdAt, d));
    }
  }
  if (waStatus && ["sent", "skipped", "failed", "pending"].includes(waStatus)) {
    conditions.push(eq(paymentReceiptsTable.waStatus, waStatus));
  }
  if (siteId && !isNaN(Number(siteId))) {
    conditions.push(eq(paymentReceiptsTable.siteId, Number(siteId)));
  }
  if (search) {
    conditions.push(
      or(
        ilike(paymentReceiptsTable.businessName, `%${search}%`),
        ilike(paymentReceiptsTable.receiptNumber, `%${search}%`),
        ilike(paymentReceiptsTable.invoiceNumber, `%${search}%`),
        ilike(paymentReceiptsTable.kasirName, `%${search}%`),
      )
    );
  }

  const limitN = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const offsetN = Math.max(Number(offset) || 0, 0);

  try {
    const [rows, [{ total }]] = await Promise.all([
      db
        .select()
        .from(paymentReceiptsTable)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(paymentReceiptsTable.createdAt))
        .limit(limitN)
        .offset(offsetN),
      db
        .select({ total: sql<number>`count(*)::int` })
        .from(paymentReceiptsTable)
        .where(conditions.length ? and(...conditions) : undefined),
    ]);

    res.json({
      total,
      limit: limitN,
      offset: offsetN,
      items: rows.map((r) => ({
        id: r.id,
        paymentId: r.paymentId,
        receiptNumber: r.receiptNumber,
        fileUrl: r.fileUrl,
        invoiceNumber: r.invoiceNumber,
        businessName: r.businessName,
        ownerName: r.ownerName,
        unitCode: r.unitCode,
        amountPaid: Number(r.amountPaid),
        taxAmount: Number(r.taxAmount),
        netAmount: Number(r.netAmount),
        paymentMethod: r.paymentMethod,
        kasirName: r.kasirName,
        journalId: r.journalId,
        waStatus: r.waStatus,
        createdAt: r.createdAt,
      })),
    });
  } catch (err) {
    req.log.error(err, "Failed to list receipts");
    res.status(500).json({ error: "Gagal mengambil data receipt" });
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
