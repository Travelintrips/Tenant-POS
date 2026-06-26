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

    // Filter bulan untuk invoice lunas: ?paidMonth=YYYY-MM (default: bulan ini)
    const paidMonthParam = typeof req.query.paidMonth === "string" ? req.query.paidMonth : null;
    let paidYear  = thisYear;
    let paidMonth = thisMonth;
    if (paidMonthParam && /^\d{4}-\d{2}$/.test(paidMonthParam)) {
      const [y, m] = paidMonthParam.split("-").map(Number);
      if (y >= 2020 && y <= 2100 && m >= 1 && m <= 12) {
        paidYear  = y;
        paidMonth = m;
      }
    }

    const [tenantStats, invoiceStats, revenueRow, pendingRow, paidRow] = await Promise.all([
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

      // Invoice lunas — bulan yang dipilih (default: bulan ini)
      db.select({
        count:  sql<number>`COUNT(*) FILTER (WHERE ${tenantInvoicesTable.status} = 'paid' AND EXTRACT(YEAR FROM ${tenantInvoicesTable.updatedAt}) = ${paidYear} AND EXTRACT(MONTH FROM ${tenantInvoicesTable.updatedAt}) = ${paidMonth})::int`,
        amount: sql<number>`COALESCE(SUM(${tenantInvoicesTable.paidAmount}) FILTER (WHERE ${tenantInvoicesTable.status} = 'paid' AND EXTRACT(YEAR FROM ${tenantInvoicesTable.updatedAt}) = ${paidYear} AND EXTRACT(MONTH FROM ${tenantInvoicesTable.updatedAt}) = ${paidMonth}), 0)::numeric`,
      }).from(tenantInvoicesTable).where(invClause),
    ]);

    res.json({
      totalTenants:      tenantStats[0]?.total       ?? 0,
      tenantAktif:       tenantStats[0]?.aktif        ?? 0,
      invoiceOverdue:    invoiceStats[0]?.overdue     ?? 0,
      invoiceUnpaid:     invoiceStats[0]?.unpaid      ?? 0,
      invoicePartial:    invoiceStats[0]?.partial     ?? 0,
      totalPiutang:      Number(invoiceStats[0]?.totalPiutang ?? 0),
      revenueThisMonth:  Number(revenueRow[0]?.total ?? 0),
      pendingPayments:   pendingRow[0]?.count         ?? 0,
      invoicePaidCount:  paidRow[0]?.count            ?? 0,
      invoicePaidAmount: Number(paidRow[0]?.amount    ?? 0),
      paidMonth: `${paidYear}-${String(paidMonth).padStart(2, "0")}`,
    });
  } catch (err) {
    req.log.error(err, "Failed to get dashboard summary");
    res.status(500).json({ error: "Gagal mengambil data dashboard" });
  }
});

/**
 * GET /api/dashboard/paid-trend
 * Tren invoice lunas per bulan — 6 bulan terakhir.
 */
router.get("/dashboard/paid-trend", async (req, res) => {
  try {
    const siteId = req.siteId;
    const invClause = siteId > 0 ? eq(tenantInvoicesTable.siteId, siteId) : undefined;

    // Ambil data 6 bulan terakhir (inklusif bulan ini)
    const rows = await db
      .select({
        year:   sql<number>`EXTRACT(YEAR  FROM ${tenantInvoicesTable.updatedAt})::int`,
        month:  sql<number>`EXTRACT(MONTH FROM ${tenantInvoicesTable.updatedAt})::int`,
        count:  sql<number>`COUNT(*)::int`,
        amount: sql<number>`COALESCE(SUM(${tenantInvoicesTable.paidAmount}), 0)::numeric`,
      })
      .from(tenantInvoicesTable)
      .where(
        invClause
          ? sql`${invClause} AND ${tenantInvoicesTable.status} = 'paid'
                AND ${tenantInvoicesTable.updatedAt} >= NOW() - INTERVAL '5 months'
                AND ${tenantInvoicesTable.updatedAt} < DATE_TRUNC('month', NOW()) + INTERVAL '1 month'`
          : sql`${tenantInvoicesTable.status} = 'paid'
                AND ${tenantInvoicesTable.updatedAt} >= NOW() - INTERVAL '5 months'
                AND ${tenantInvoicesTable.updatedAt} < DATE_TRUNC('month', NOW()) + INTERVAL '1 month'`,
      )
      .groupBy(
        sql`EXTRACT(YEAR FROM ${tenantInvoicesTable.updatedAt})`,
        sql`EXTRACT(MONTH FROM ${tenantInvoicesTable.updatedAt})`,
      )
      .orderBy(
        sql`EXTRACT(YEAR FROM ${tenantInvoicesTable.updatedAt})`,
        sql`EXTRACT(MONTH FROM ${tenantInvoicesTable.updatedAt})`,
      );

    // Lengkapi dengan bulan kosong agar selalu 6 titik
    const BULAN_ID = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Ags","Sep","Okt","Nov","Des"];
    const map = new Map(rows.map(r => [`${r.year}-${r.month}`, r]));
    const now = new Date();
    const trend = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
      const row = map.get(key);
      trend.push({
        label:  BULAN_ID[d.getMonth()],
        month:  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        count:  row?.count  ?? 0,
        amount: Number(row?.amount ?? 0),
      });
    }

    res.json({ trend });
  } catch (err) {
    req.log.error(err, "Failed to get paid trend");
    res.status(500).json({ error: "Gagal mengambil data tren pembayaran" });
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
