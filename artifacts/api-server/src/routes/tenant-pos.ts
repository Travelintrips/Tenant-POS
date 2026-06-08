import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { tenantsTable, tenantBookingsTable } from "@workspace/db/schema";
import { eq, and, sql, gte, lte } from "drizzle-orm";

const router: IRouter = Router();

/**
 * GET /api/tenant-pos/overview
 * Ringkasan status pembayaran POS Tenant
 */
router.get("/tenant-pos/overview", async (_req, res) => {
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
      .from(sql`tenant_payments`)
      .where(sql`paid_at::date = ${today}`);

    res.json({
      totalActiveTenants: totalActive?.count ?? 0,
      unpaidCount: unpaid?.count ?? 0,
      overdueCount: overdue?.count ?? 0,
      paidTodayAmount: paidToday?.total ?? 0,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal mengambil overview" });
  }
});

/**
 * GET /api/tenant-pos/floor-plan
 * Data denah lengkap dengan status pembayaran per tenant
 */
router.get("/tenant-pos/floor-plan", async (_req, res) => {
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

    const result = rows.map((row, idx) => ({
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
    console.error(err);
    res.status(500).json({ error: "Gagal mengambil data floor-plan" });
  }
});

export default router;
