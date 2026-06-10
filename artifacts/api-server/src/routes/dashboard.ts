import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  tenantsTable,
  tenantInvoicesTable,
  tenantPaymentsTable,
  mallUnitsTable,
} from "@workspace/db/schema";
import { eq, sql, and } from "drizzle-orm";
import { requireAnyRole } from "../middlewares/auth";

const router: IRouter = Router();

router.use("/dashboard", requireAnyRole("owner", "admin", "finance"));

/**
 * GET /api/dashboard/summary
 */
router.get("/dashboard/summary", async (req, res) => {
  try {
    const siteId = req.siteId;
    const tenantClause = siteId > 0 ? eq(tenantsTable.siteId, siteId) : undefined;
    const invClause    = siteId > 0 ? eq(tenantInvoicesTable.siteId, siteId) : undefined;
    const payClause    = siteId > 0 ? eq(tenantPaymentsTable.siteId, siteId) : undefined;

    const now       = new Date();
    const thisYear  = now.getFullYear();
    const thisMonth = now.getMonth() + 1;

    const [tenantStats, invoiceStats, revenueRow, pendingRow] = await Promise.all([
      db.select({
        total: sql<number>`COUNT(*)::int`,
        aktif: sql<number>`COUNT(*) FILTER (WHERE LOWER(${tenantsTable.status}) IN ('aktif','active'))::int`,
      }).from(tenantsTable).where(tenantClause),

      db.select({
        overdue:      sql<number>`COUNT(*) FILTER (WHERE ${tenantInvoicesTable.status} = 'overdue')::int`,
        unpaid:       sql<number>`COUNT(*) FILTER (WHERE ${tenantInvoicesTable.status} = 'unpaid')::int`,
        partial:      sql<number>`COUNT(*) FILTER (WHERE ${tenantInvoicesTable.status} = 'partial')::int`,
        totalPiutang: sql<number>`COALESCE(SUM(${tenantInvoicesTable.outstandingAmount}) FILTER (WHERE ${tenantInvoicesTable.status} NOT IN ('paid','cancelled')), 0)::numeric`,
      }).from(tenantInvoicesTable).where(invClause),

      db.select({
        total: sql<number>`COALESCE(SUM(${tenantPaymentsTable.amount} - COALESCE(${tenantPaymentsTable.refundAmount}, 0)), 0)::numeric`,
      }).from(tenantPaymentsTable).where(and(
        payClause,
        sql`EXTRACT(YEAR  FROM ${tenantPaymentsTable.paidAt}) = ${thisYear}`,
        sql`EXTRACT(MONTH FROM ${tenantPaymentsTable.paidAt}) = ${thisMonth}`,
        sql`(${tenantPaymentsTable.isVoided} = false OR ${tenantPaymentsTable.isVoided} IS NULL)`,
      )),

      db.select({ count: sql<number>`COUNT(*)::int` })
        .from(tenantPaymentsTable)
        .where(and(payClause, sql`${tenantPaymentsTable.approvalStatus} = 'pending_review'`)),
    ]);

    res.json({
      totalTenants:     tenantStats[0]?.total       ?? 0,
      tenantAktif:      tenantStats[0]?.aktif        ?? 0,
      invoiceOverdue:   invoiceStats[0]?.overdue     ?? 0,
      invoiceUnpaid:    invoiceStats[0]?.unpaid      ?? 0,
      invoicePartial:   invoiceStats[0]?.partial     ?? 0,
      totalPiutang:     Number(invoiceStats[0]?.totalPiutang ?? 0),
      revenueThisMonth: Number(revenueRow[0]?.total ?? 0),
      pendingPayments:  pendingRow[0]?.count         ?? 0,
    });
  } catch (err) {
    req.log.error(err, "Failed to get dashboard summary");
    res.status(500).json({ error: "Gagal mengambil data dashboard" });
  }
});

/**
 * GET /api/dashboard/unit-stats
 * Statistik unit mall per status untuk widget denah di dashboard.
 */
router.get("/dashboard/unit-stats", async (_req, res) => {
  try {
    const rows = await db
      .select({
        status: mallUnitsTable.status,
        count:  sql<number>`COUNT(*)::int`,
      })
      .from(mallUnitsTable)
      .groupBy(mallUnitsTable.status);

    const stats: Record<string, number> = {};
    let total = 0;
    for (const row of rows) {
      stats[row.status] = row.count;
      total += row.count;
    }

    // Hitung persentase okupansi (occupied + overdue dihitung terisi)
    const occupied = (stats["occupied"] ?? 0) + (stats["overdue"] ?? 0);
    const occupancyRate = total > 0 ? Math.round((occupied / total) * 100) : 0;

    res.json({ stats, total, occupancyRate });
  } catch (err) {
    res.status(500).json({ error: "Gagal mengambil statistik unit" });
  }
});

export default router;
