import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  tenantsTable,
  tenantBookingsTable,
  tenantPaymentsTable,
} from "@workspace/db/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

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

// ─── GET /api/tenant-pos/overview ────────────────────────────────────────────
router.get("/tenant-pos/overview", async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);

    const [totalActive] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tenantsTable)
      .where(eq(tenantsTable.status, "aktif"));

    const [unpaid] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tenantBookingsTable)
      .where(
        and(
          eq(tenantBookingsTable.bookingStatus, "aktif"),
          sql`${tenantBookingsTable.paymentStatus} IN ('UNPAID', 'PARTIAL')`
        )
      );

    const [overdue] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tenantBookingsTable)
      .where(eq(tenantBookingsTable.paymentStatus, "OVERDUE"));

    const [paidToday] = await db
      .select({ total: sql<number>`coalesce(sum(amount), 0)::int` })
      .from(tenantPaymentsTable)
      .where(sql`${tenantPaymentsTable.paidAt}::date = ${today}`);

    res.json({
      totalActiveTenants: totalActive?.count ?? 0,
      unpaidCount: unpaid?.count ?? 0,
      overdueCount: overdue?.count ?? 0,
      paidTodayAmount: paidToday?.total ?? 0,
    });
  } catch (err) {
    req.log.error(err, "Failed to get POS overview");
    res.status(500).json({ error: "Gagal mengambil overview" });
  }
});

// ─── GET /api/tenant-pos/floor-plan ──────────────────────────────────────────
router.get("/tenant-pos/floor-plan", async (req, res) => {
  try {
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
          eq(tenantBookingsTable.bookingStatus, "aktif")
        )
      )
      .orderBy(tenantsTable.areaName, tenantsTable.id);

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
      totalAmount: row.totalAmount ?? 0,
      paidAmount: row.paidAmount ?? 0,
      remainingAmount: row.remainingAmount ?? 0,
      paymentStatus: (row.paymentStatus ?? "UNPAID") as string,
      bookingStatus: row.bookingStatus ?? "aktif",
      dueDate: row.dueDate ?? null,
      periodLabel: row.periodLabel ?? null,
    }));

    res.json(result);
  } catch (err) {
    req.log.error(err, "Failed to get floor plan");
    res.status(500).json({ error: "Gagal mengambil data floor-plan" });
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
      .orderBy(tenantPaymentsTable.paidAt);

    const result = payments.map((p) => ({
      id: p.id,
      receiptNumber: p.receiptNumber,
      amountPaid: p.amount,
      discountAmount: p.discountAmount,
      penaltyAmount: p.penaltyAmount,
      paymentMethod: p.paymentMethod,
      paymentStatus: p.paymentStatus,
      paymentDate: p.paidAt,
      notes: p.notes,
      createdAt: p.createdAt,
    }));

    res.json(result);
  } catch (err) {
    req.log.error(err, "Failed to get payment history for booking");
    res.status(500).json({ error: "Gagal mengambil riwayat pembayaran" });
  }
});

// ─── GET /api/tenant-pos/payments/:bookingId ─────────────────────────────────
router.get("/tenant-pos/payments/:bookingId", async (req, res) => {
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
    res.json(payments);
  } catch (err) {
    req.log.error(err, "Failed to get payments for booking");
    res.status(500).json({ error: "Gagal mengambil riwayat pembayaran" });
  }
});

// ─── GET /api/tenant-pos/recent-payments ─────────────────────────────────────
router.get("/tenant-pos/recent-payments", async (req, res) => {
  try {
    const limitParam = Math.min(Number(req.query.limit ?? 20), 50);
    const rows = await db
      .select({
        id: tenantPaymentsTable.id,
        amount: tenantPaymentsTable.amount,
        discountAmount: tenantPaymentsTable.discountAmount,
        penaltyAmount: tenantPaymentsTable.penaltyAmount,
        paymentMethod: tenantPaymentsTable.paymentMethod,
        receiptNumber: tenantPaymentsTable.receiptNumber,
        notes: tenantPaymentsTable.notes,
        paidAt: tenantPaymentsTable.paidAt,
        businessName: tenantsTable.businessName,
        boothNumber: tenantsTable.boothNumber,
        areaName: tenantsTable.areaName,
        periodLabel: tenantBookingsTable.periodLabel,
      })
      .from(tenantPaymentsTable)
      .innerJoin(tenantBookingsTable, eq(tenantPaymentsTable.bookingId, tenantBookingsTable.id))
      .innerJoin(tenantsTable, eq(tenantBookingsTable.tenantId, tenantsTable.id))
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
  amountPaid: z.number().int().min(1, "amountPaid harus lebih dari 0"),
  discountAmount: z.number().int().min(0).default(0),
  penaltyAmount: z.number().int().min(0).default(0),
  paymentMethod: z.enum(["tunai", "transfer", "qris", "edc", "other"]),
  paymentDate: z.string().optional(),
  notes: z.string().optional(),
});

router.post("/tenant-pos/payments", async (req, res) => {
  const parsed = paymentBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Data tidak valid",
      detail: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  const {
    bookingId,
    tenantId,
    amountPaid,
    discountAmount,
    penaltyAmount,
    paymentMethod,
    paymentDate,
    notes,
  } = parsed.data;

  try {
    const result = await db.transaction(async (tx) => {
      const [booking] = await tx
        .select()
        .from(tenantBookingsTable)
        .where(eq(tenantBookingsTable.id, bookingId))
        .for("update");

      if (!booking) {
        throw Object.assign(new Error("Booking tidak ditemukan"), { status: 404 });
      }
      if (booking.tenantId !== tenantId) {
        throw Object.assign(new Error("tenantId tidak cocok dengan booking"), { status: 400 });
      }
      if (booking.paymentStatus === "PAID") {
        throw Object.assign(new Error("Booking ini sudah lunas"), { status: 409 });
      }
      if (booking.paymentStatus === "CANCELLED") {
        throw Object.assign(new Error("Booking ini sudah dibatalkan"), { status: 409 });
      }

      const [tenant] = await tx
        .select({ id: tenantsTable.id })
        .from(tenantsTable)
        .where(eq(tenantsTable.id, tenantId));

      if (!tenant) {
        throw Object.assign(new Error("Tenant tidak ditemukan"), { status: 404 });
      }

      const finalBill = booking.totalAmount - discountAmount + penaltyAmount;

      const [prevPaid] = await tx
        .select({ total: sql<number>`coalesce(sum(amount), 0)::int` })
        .from(tenantPaymentsTable)
        .where(eq(tenantPaymentsTable.bookingId, bookingId));

      const previousPaidAmount = prevPaid?.total ?? 0;
      const newPaidAmount = previousPaidAmount + amountPaid;
      const remainingAmount = Math.max(finalBill - newPaidAmount, 0);

      let paymentStatus: "PAID" | "PARTIAL" | "UNPAID";
      if (newPaidAmount >= finalBill) {
        paymentStatus = "PAID";
      } else if (newPaidAmount > 0) {
        paymentStatus = "PARTIAL";
      } else {
        paymentStatus = "UNPAID";
      }

      const receiptNumber = await generateReceiptNumber();

      const paidAt = paymentDate ? new Date(paymentDate) : new Date();
      const [payment] = await tx
        .insert(tenantPaymentsTable)
        .values({
          bookingId,
          tenantId,
          amount: amountPaid,
          discountAmount,
          penaltyAmount,
          paymentMethod,
          paymentStatus: "PAID",
          receiptNumber,
          notes,
          paidAt,
        })
        .returning();

      const [updatedBooking] = await tx
        .update(tenantBookingsTable)
        .set({
          paidAmount: newPaidAmount,
          remainingAmount,
          paymentStatus,
          updatedAt: new Date(),
        })
        .where(eq(tenantBookingsTable.id, bookingId))
        .returning();

      return { payment, booking: updatedBooking, paymentStatus, newPaidAmount, remainingAmount, receiptNumber };
    });

    res.status(201).json({
      success: true,
      payment: result.payment,
      receiptNumber: result.receiptNumber,
      paymentStatus: result.paymentStatus,
      paidAmount: result.newPaidAmount,
      remainingAmount: result.remainingAmount,
    });
  } catch (err) {
    const e = err as Error & { status?: number };
    if (e.status) {
      res.status(e.status).json({ error: e.message });
    } else {
      console.error(err);
      res.status(500).json({ error: "Gagal memproses pembayaran" });
    }
  }
});

// ─── GET /api/tenant-pos/payments/:paymentId/receipt ─────────────────────────
router.get("/tenant-pos/payments/:paymentId/receipt", async (req, res) => {
  const paymentId = Number(req.params.paymentId);
  if (isNaN(paymentId)) {
    res.status(400).json({ error: "ID tidak valid" });
    return;
  }
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
        notes: tenantPaymentsTable.notes,
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

    if (!row) {
      res.status(404).json({ error: "Data pembayaran tidak ditemukan" });
      return;
    }

    res.json({
      receiptNumber: row.receiptNumber ?? `PAY-${paymentId}`,
      paymentDate: row.paymentDate,
      businessName: row.businessName,
      ownerName: row.ownerName,
      boothNumber: row.boothNumber,
      billingPeriod: row.billingPeriod ?? "—",
      totalAmount: row.totalAmount,
      discountAmount: row.discountAmount ?? 0,
      penaltyAmount: row.penaltyAmount ?? 0,
      amountPaid: row.amountPaid,
      remainingAmount: row.remainingAmount ?? 0,
      paymentMethod: row.paymentMethod,
      paymentStatus: row.paymentStatus,
      notes: row.notes ?? null,
      adminName: "Admin",
    });
  } catch (err) {
    req.log.error(err, "Failed to get payment receipt");
    res.status(500).json({ error: "Gagal mengambil data receipt" });
  }
});

export default router;
