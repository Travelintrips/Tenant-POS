import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  tenantsTable,
  tenantBookingsTable,
  tenantPaymentsTable,
} from "@workspace/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

function generateReceiptNumber(): string {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, "");
  const timePart = String(now.getTime()).slice(-6);
  return `RCP-${datePart}-${timePart}`;
}

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
      remainingAmount: (row.totalAmount ?? 0) - (row.paidAmount ?? 0),
      paymentStatus: row.paymentStatus ?? "UNPAID",
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

const paymentBodySchema = z.object({
  bookingId: z.number().int().positive(),
  amount: z.number().int().positive(),
  discountAmount: z.number().int().min(0).default(0),
  penaltyAmount: z.number().int().min(0).default(0),
  paymentMethod: z.enum(["tunai", "transfer", "qris"]),
  notes: z.string().optional(),
});

router.post("/tenant-pos/payments", async (req, res) => {
  const parsed = paymentBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Data tidak valid", detail: parsed.error.flatten() });
    return;
  }

  const { bookingId, amount, discountAmount, penaltyAmount, paymentMethod, notes } = parsed.data;

  try {
    const [booking] = await db
      .select()
      .from(tenantBookingsTable)
      .where(eq(tenantBookingsTable.id, bookingId));

    if (!booking) {
      res.status(404).json({ error: "Booking tidak ditemukan" });
      return;
    }

    if (booking.paymentStatus === "PAID") {
      res.status(409).json({ error: "Booking ini sudah lunas" });
      return;
    }

    if (booking.paymentStatus === "CANCELLED") {
      res.status(409).json({ error: "Booking ini sudah dibatalkan" });
      return;
    }

    const remaining = booking.totalAmount - booking.paidAmount;
    // Amount efektif setelah diskon dan penalti
    const effectiveAmount = Math.min(amount - discountAmount + penaltyAmount, remaining);
    if (effectiveAmount <= 0) {
      res.status(400).json({ error: "Jumlah pembayaran tidak valid" });
      return;
    }

    const receiptNumber = generateReceiptNumber();

    const [payment] = await db
      .insert(tenantPaymentsTable)
      .values({
        bookingId,
        tenantId: booking.tenantId,
        amount: effectiveAmount,
        discountAmount,
        penaltyAmount,
        paymentMethod,
        paymentStatus: "PAID",
        receiptNumber,
        notes,
        paidAt: new Date(),
      })
      .returning();

    const newPaidAmount = booking.paidAmount + effectiveAmount;
    const newPaymentStatus: "PAID" | "PARTIAL" | "UNPAID" =
      newPaidAmount >= booking.totalAmount
        ? "PAID"
        : newPaidAmount > 0
        ? "PARTIAL"
        : "UNPAID";

    const [updatedBooking] = await db
      .update(tenantBookingsTable)
      .set({
        paidAmount: newPaidAmount,
        paymentStatus: newPaymentStatus,
        updatedAt: new Date(),
      })
      .where(eq(tenantBookingsTable.id, bookingId))
      .returning();

    res.json({
      payment: {
        ...payment,
        receiptNumber: payment.receiptNumber,
      },
      booking: updatedBooking,
      remainingAmount: updatedBooking.totalAmount - updatedBooking.paidAmount,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal memproses pembayaran" });
  }
});

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
      .orderBy(tenantPaymentsTable.paidAt);

    res.json(payments);
  } catch (err) {
    req.log.error(err, "Failed to get payments for booking");
    res.status(500).json({ error: "Gagal mengambil riwayat pembayaran" });
  }
});

export default router;
