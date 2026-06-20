import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  tenantsTable,
  tenantBookingsTable,
  tenantPaymentsTable,
  tenantInvoicesTable,
} from "@workspace/db/schema";
import { eq, sql, desc, and, isNull, isNotNull } from "drizzle-orm";
import { requireAnyRole } from "../middlewares/auth";

const router: IRouter = Router();

router.use("/laporan", requireAnyRole("owner", "admin", "finance"));

const BULAN_LABEL = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"];

// Helper: non-void condition
const notVoided = sql`(${tenantPaymentsTable.isVoided} = false OR ${tenantPaymentsTable.isVoided} IS NULL)`;

/**
 * GET /api/laporan/summary?tahun=2026
 * Ringkasan bulanan pendapatan sewa tenant untuk tahun tertentu.
 * Void payments dikecualikan; refund mengurangi pendapatan bersih.
 */
router.get("/laporan/summary", async (req, res) => {
  const tahunRaw = req.query.tahun;
  const tahun = tahunRaw ? parseInt(String(tahunRaw), 10) : new Date().getFullYear();

  if (isNaN(tahun)) {
    return res.status(400).json({ error: "Parameter tahun tidak valid" });
  }

  const siteId = req.siteId;
  const paymentSiteClause = siteId > 0
    ? sql`AND ${tenantPaymentsTable.siteId} = ${siteId}`
    : sql``;
  const bookingSiteClause = siteId > 0
    ? sql`AND ${tenantBookingsTable.siteId} = ${siteId}`
    : sql``;

  const rows = await db
    .select({
      bulanNum: sql<number>`EXTRACT(MONTH FROM ${tenantPaymentsTable.paidAt})::int`,
      totalAmount: sql<number>`SUM(${tenantPaymentsTable.amount} - COALESCE(${tenantPaymentsTable.refundAmount}, 0))::numeric`,
      jumlahTransaksi: sql<number>`COUNT(*)::int`,
    })
    .from(tenantPaymentsTable)
    .where(
      sql`EXTRACT(YEAR FROM ${tenantPaymentsTable.paidAt}) = ${tahun}
        AND (${tenantPaymentsTable.isVoided} = false OR ${tenantPaymentsTable.isVoided} IS NULL)
        ${paymentSiteClause}`
    )
    .groupBy(sql`EXTRACT(MONTH FROM ${tenantPaymentsTable.paidAt})`)
    .orderBy(sql`EXTRACT(MONTH FROM ${tenantPaymentsTable.paidAt})`);

  const bulanMap: Record<number, { totalAmount: number; jumlahTransaksi: number }> = {};
  for (const row of rows) {
    bulanMap[row.bulanNum] = {
      totalAmount: Number(row.totalAmount),
      jumlahTransaksi: row.jumlahTransaksi,
    };
  }

  const monthly = BULAN_LABEL.map((label, idx) => {
    const num = idx + 1;
    return {
      bulan: label,
      bulanNum: num,
      totalAmount: bulanMap[num]?.totalAmount ?? 0,
      jumlahTransaksi: bulanMap[num]?.jumlahTransaksi ?? 0,
    };
  });

  const totalPendapatan = monthly.reduce((s, m) => s + m.totalAmount, 0);
  const totalTransaksi = rows.reduce((s, r) => s + r.jumlahTransaksi, 0);

  const tunggakanRows = await db
    .select({
      totalTunggakan: sql<number>`COALESCE(SUM(${tenantBookingsTable.remainingAmount}), 0)::numeric`,
      jumlahTunggakan: sql<number>`COUNT(*)::int`,
    })
    .from(tenantBookingsTable)
    .where(
      sql`UPPER(${tenantBookingsTable.paymentStatus}) IN ('UNPAID', 'PARTIAL', 'OVERDUE')
        ${bookingSiteClause}`
    );

  return res.json({
    tahun,
    monthly,
    totalPendapatan,
    totalTransaksi,
    tunggakan: {
      totalTunggakan: Number(tunggakanRows[0]?.totalTunggakan ?? 0),
      jumlahUnit: tunggakanRows[0]?.jumlahTunggakan ?? 0,
    },
  });
});

/**
 * GET /api/laporan/kpi
 * KPI utama: revenue bulan ini, paid, outstanding, overdue, jumlah tenant overdue, collection rate
 */
router.get("/laporan/kpi", async (req, res) => {
  const now = new Date();
  const thisYear = now.getFullYear();
  const thisMonth = now.getMonth() + 1;
  const kpiSiteId = req.siteId;
  const kpiPaySiteClause = kpiSiteId > 0
    ? sql`AND ${tenantPaymentsTable.siteId} = ${kpiSiteId}`
    : sql``;
  const kpiInvSiteClause = kpiSiteId > 0
    ? sql`AND ${tenantInvoicesTable.siteId} = ${kpiSiteId}`
    : sql``;

  // Revenue bulan ini (net of refunds, excluding void)
  const revenueThisMonth = await db
    .select({
      total: sql<number>`COALESCE(SUM(${tenantPaymentsTable.amount} - COALESCE(${tenantPaymentsTable.refundAmount}, 0)), 0)::numeric`,
    })
    .from(tenantPaymentsTable)
    .where(
      sql`EXTRACT(YEAR FROM ${tenantPaymentsTable.paidAt}) = ${thisYear}
        AND EXTRACT(MONTH FROM ${tenantPaymentsTable.paidAt}) = ${thisMonth}
        AND (${tenantPaymentsTable.isVoided} = false OR ${tenantPaymentsTable.isVoided} IS NULL)
        ${kpiPaySiteClause}`
    );

  // Total paid bulan ini (gross)
  const paidThisMonth = await db
    .select({
      total: sql<number>`COALESCE(SUM(${tenantPaymentsTable.amount}), 0)::numeric`,
    })
    .from(tenantPaymentsTable)
    .where(
      sql`EXTRACT(YEAR FROM ${tenantPaymentsTable.paidAt}) = ${thisYear}
        AND EXTRACT(MONTH FROM ${tenantPaymentsTable.paidAt}) = ${thisMonth}
        AND (${tenantPaymentsTable.isVoided} = false OR ${tenantPaymentsTable.isVoided} IS NULL)
        ${kpiPaySiteClause}`
    );

  // Total outstanding dari invoice
  const outstandingRow = await db
    .select({
      total: sql<number>`COALESCE(SUM(${tenantInvoicesTable.outstandingAmount}), 0)::numeric`,
    })
    .from(tenantInvoicesTable)
    .where(sql`${tenantInvoicesTable.status} NOT IN ('paid', 'cancelled') ${kpiInvSiteClause}`);

  // Total overdue (invoice melewati due_date dan belum lunas)
  const overdueRow = await db
    .select({
      totalOverdue: sql<number>`COALESCE(SUM(${tenantInvoicesTable.outstandingAmount}), 0)::numeric`,
      jumlahInvoice: sql<number>`COUNT(*)::int`,
      jumlahTenant: sql<number>`COUNT(DISTINCT ${tenantInvoicesTable.tenantId})::int`,
    })
    .from(tenantInvoicesTable)
    .where(
      sql`${tenantInvoicesTable.status} NOT IN ('paid', 'cancelled')
        AND ${tenantInvoicesTable.dueDate} < CURRENT_DATE
        ${kpiInvSiteClause}`
    );

  // Collection rate: paid / (paid + outstanding) x 100
  const totalBilled = await db
    .select({
      totalAmount: sql<number>`COALESCE(SUM(${tenantInvoicesTable.totalAmount}), 0)::numeric`,
      totalPaid: sql<number>`COALESCE(SUM(${tenantInvoicesTable.paidAmount}), 0)::numeric`,
    })
    .from(tenantInvoicesTable)
    .where(sql`${tenantInvoicesTable.status} != 'cancelled' ${kpiInvSiteClause}`);

  const totalBilledAmt = Number(totalBilled[0]?.totalAmount ?? 0);
  const totalPaidAmt = Number(totalBilled[0]?.totalPaid ?? 0);
  const collectionRate = totalBilledAmt > 0 ? Math.round((totalPaidAmt / totalBilledAmt) * 100) : 0;

  return res.json({
    revenueThisMonth: Number(revenueThisMonth[0]?.total ?? 0),
    paidThisMonth: Number(paidThisMonth[0]?.total ?? 0),
    totalOutstanding: Number(outstandingRow[0]?.total ?? 0),
    totalOverdue: Number(overdueRow[0]?.totalOverdue ?? 0),
    jumlahInvoiceOverdue: overdueRow[0]?.jumlahInvoice ?? 0,
    jumlahTenantOverdue: overdueRow[0]?.jumlahTenant ?? 0,
    collectionRate,
  });
});

/**
 * GET /api/laporan/piutang
 * Laporan piutang tenant dari tenant_invoices dengan aging_days
 * Filter: tenant_id, floor, status, dari, sampai
 */
router.get("/laporan/piutang", async (req, res) => {
  const { tenant_id, floor, status, dari, sampai, limit: limitRaw, offset: offsetRaw } = req.query;
  const limit = limitRaw ? Math.min(parseInt(String(limitRaw), 10), 500) : 200;
  const offset = offsetRaw ? parseInt(String(offsetRaw), 10) : 0;

  const conditions: string[] = [
    `${tenantInvoicesTable.status.name} != 'cancelled'`,
  ];

  if (tenant_id) conditions.push(`${tenantInvoicesTable.tenantId.name} = ${parseInt(String(tenant_id), 10)}`);
  if (status) conditions.push(`${tenantInvoicesTable.status.name} = '${String(status).replace(/'/g, "''")}'`);
  if (dari) conditions.push(`${tenantInvoicesTable.dueDate.name} >= '${String(dari)}'`);
  if (sampai) conditions.push(`${tenantInvoicesTable.dueDate.name} <= '${String(sampai)}'`);

  // Build where dynamically using sql tag
  let whereClause = sql`ti.status != 'cancelled'`;
  if (req.siteId > 0) {
    whereClause = sql`${whereClause} AND ti.site_id = ${req.siteId}`;
  }
  if (tenant_id && !isNaN(parseInt(String(tenant_id), 10))) {
    whereClause = sql`${whereClause} AND ti.tenant_id = ${parseInt(String(tenant_id), 10)}`;
  }
  if (status) {
    const s = String(status);
    whereClause = sql`${whereClause} AND ti.status = ${s}`;
  }
  if (dari) {
    whereClause = sql`${whereClause} AND ti.due_date >= ${String(dari)}`;
  }
  if (sampai) {
    whereClause = sql`${whereClause} AND ti.due_date <= ${String(sampai)}`;
  }
  if (floor) {
    whereClause = sql`${whereClause} AND tb.floor = ${String(floor)}`;
  }

  const rows = await db.execute(sql`
    SELECT
      ti.id,
      ti.invoice_number,
      ti.tenant_id,
      te.business_name,
      te.owner_name,
      COALESCE(ti.unit_code, tb.unit_code) AS unit_code,
      COALESCE(tb.floor, '') AS floor,
      ti.due_date,
      ti.period_start,
      ti.period_end,
      ti.total_amount::numeric AS total_amount,
      ti.paid_amount::numeric AS paid_amount,
      ti.outstanding_amount::numeric AS outstanding_amount,
      ti.status,
      CASE
        WHEN ti.due_date IS NULL THEN NULL
        WHEN ti.due_date >= CURRENT_DATE THEN 0
        ELSE (CURRENT_DATE - ti.due_date)::int
      END AS aging_days
    FROM tenant_invoices ti
    JOIN tenants te ON te.id = ti.tenant_id
    LEFT JOIN tenant_bookings tb ON tb.id = ti.booking_id
    WHERE ${whereClause}
    ORDER BY
      CASE WHEN ti.due_date IS NULL THEN 1 ELSE 0 END,
      ti.due_date ASC
    LIMIT ${limit} OFFSET ${offset}
  `);

  const totalRow = await db.execute(sql`
    SELECT COUNT(*)::int AS total
    FROM tenant_invoices ti
    JOIN tenants te ON te.id = ti.tenant_id
    LEFT JOIN tenant_bookings tb ON tb.id = ti.booking_id
    WHERE ${whereClause}
  `);

  const rowsArr = ((rows as any).rows ?? rows) as any[];
  const totalArr = ((totalRow as any).rows ?? totalRow) as any[];

  return res.json({
    data: rowsArr.map((r) => ({
      id: r.id,
      invoiceNumber: r.invoice_number,
      tenantId: r.tenant_id,
      businessName: r.business_name,
      ownerName: r.owner_name,
      unitCode: r.unit_code ?? "-",
      floor: r.floor ?? "-",
      dueDate: r.due_date,
      periodStart: r.period_start,
      periodEnd: r.period_end,
      totalAmount: Number(r.total_amount ?? 0),
      paidAmount: Number(r.paid_amount ?? 0),
      outstandingAmount: Number(r.outstanding_amount ?? 0),
      status: r.status,
      agingDays: r.aging_days === null ? null : Number(r.aging_days),
    })),
    pagination: {
      total: totalArr[0]?.total ?? 0,
      limit,
      offset,
    },
  });
});

/**
 * GET /api/laporan/aging
 * Aging receivable buckets dari tenant_invoices
 */
router.get("/laporan/aging", async (req, res) => {
  const agingSiteClause = req.siteId > 0 ? sql`AND site_id = ${req.siteId}` : sql``;
  const result = await db.execute(sql`
    SELECT
      SUM(CASE WHEN due_date >= CURRENT_DATE THEN outstanding_amount ELSE 0 END)::numeric AS belum_jatuh_tempo,
      SUM(CASE WHEN due_date < CURRENT_DATE AND (CURRENT_DATE - due_date) BETWEEN 1 AND 30 THEN outstanding_amount ELSE 0 END)::numeric AS hari_0_30,
      SUM(CASE WHEN due_date < CURRENT_DATE AND (CURRENT_DATE - due_date) BETWEEN 31 AND 60 THEN outstanding_amount ELSE 0 END)::numeric AS hari_31_60,
      SUM(CASE WHEN due_date < CURRENT_DATE AND (CURRENT_DATE - due_date) BETWEEN 61 AND 90 THEN outstanding_amount ELSE 0 END)::numeric AS hari_61_90,
      SUM(CASE WHEN due_date < CURRENT_DATE AND (CURRENT_DATE - due_date) > 90 THEN outstanding_amount ELSE 0 END)::numeric AS hari_gt90,
      COUNT(CASE WHEN due_date >= CURRENT_DATE THEN 1 END)::int AS count_belum_jatuh_tempo,
      COUNT(CASE WHEN due_date < CURRENT_DATE AND (CURRENT_DATE - due_date) BETWEEN 1 AND 30 THEN 1 END)::int AS count_0_30,
      COUNT(CASE WHEN due_date < CURRENT_DATE AND (CURRENT_DATE - due_date) BETWEEN 31 AND 60 THEN 1 END)::int AS count_31_60,
      COUNT(CASE WHEN due_date < CURRENT_DATE AND (CURRENT_DATE - due_date) BETWEEN 61 AND 90 THEN 1 END)::int AS count_61_90,
      COUNT(CASE WHEN due_date < CURRENT_DATE AND (CURRENT_DATE - due_date) > 90 THEN 1 END)::int AS count_gt90
    FROM tenant_invoices
    WHERE status NOT IN ('paid', 'cancelled') ${agingSiteClause}
  `);

  const r = (((result as any).rows ?? result) as any[])[0] ?? {};
  return res.json({
    buckets: [
      { label: "Belum Jatuh Tempo", amount: Number(r.belum_jatuh_tempo ?? 0), count: Number(r.count_belum_jatuh_tempo ?? 0) },
      { label: "0–30 Hari", amount: Number(r.hari_0_30 ?? 0), count: Number(r.count_0_30 ?? 0) },
      { label: "31–60 Hari", amount: Number(r.hari_31_60 ?? 0), count: Number(r.count_31_60 ?? 0) },
      { label: "61–90 Hari", amount: Number(r.hari_61_90 ?? 0), count: Number(r.count_61_90 ?? 0) },
      { label: ">90 Hari", amount: Number(r.hari_gt90 ?? 0), count: Number(r.count_gt90 ?? 0) },
    ],
  });
});

/**
 * GET /api/laporan/payment-methods?tahun=2026&bulan=&dari=&sampai=
 * Rekap pembayaran per metode (void dikecualikan, refund dikurangi)
 */
router.get("/laporan/payment-methods", async (req, res) => {
  const { tahun: tahunRaw, bulan: bulanRaw, dari, sampai } = req.query;
  const tahun = tahunRaw ? parseInt(String(tahunRaw), 10) : new Date().getFullYear();
  const bulan = bulanRaw ? parseInt(String(bulanRaw), 10) : null;

  let whereClause = sql`(${tenantPaymentsTable.isVoided} = false OR ${tenantPaymentsTable.isVoided} IS NULL)`;

  if (req.siteId > 0) {
    whereClause = sql`${whereClause} AND ${tenantPaymentsTable.siteId} = ${req.siteId}`;
  }

  if (dari && sampai) {
    whereClause = sql`${whereClause}
      AND DATE(${tenantPaymentsTable.paidAt}) >= ${String(dari)}
      AND DATE(${tenantPaymentsTable.paidAt}) <= ${String(sampai)}`;
  } else {
    whereClause = sql`${whereClause}
      AND EXTRACT(YEAR FROM ${tenantPaymentsTable.paidAt}) = ${tahun}`;
    if (bulan && !isNaN(bulan) && bulan >= 1 && bulan <= 12) {
      whereClause = sql`${whereClause}
        AND EXTRACT(MONTH FROM ${tenantPaymentsTable.paidAt}) = ${bulan}`;
    }
  }

  const rows = await db
    .select({
      paymentMethod: tenantPaymentsTable.paymentMethod,
      totalAmount: sql<number>`SUM(${tenantPaymentsTable.amount} - COALESCE(${tenantPaymentsTable.refundAmount}, 0))::numeric`,
      grossAmount: sql<number>`SUM(${tenantPaymentsTable.amount})::numeric`,
      refundTotal: sql<number>`SUM(COALESCE(${tenantPaymentsTable.refundAmount}, 0))::numeric`,
      jumlahTransaksi: sql<number>`COUNT(*)::int`,
    })
    .from(tenantPaymentsTable)
    .where(whereClause)
    .groupBy(tenantPaymentsTable.paymentMethod)
    .orderBy(sql`SUM(${tenantPaymentsTable.amount}) DESC`);

  const METHODS = ["tunai", "transfer", "qris", "edc", "other"];
  const methodMap: Record<string, any> = {};
  for (const r of rows) {
    methodMap[r.paymentMethod ?? "other"] = r;
  }

  const data = METHODS.map((m) => {
    const r = methodMap[m];
    return {
      method: m,
      totalAmount: r ? Number(r.totalAmount) : 0,
      grossAmount: r ? Number(r.grossAmount) : 0,
      refundTotal: r ? Number(r.refundTotal) : 0,
      jumlahTransaksi: r ? r.jumlahTransaksi : 0,
    };
  });

  // Include any unlisted method
  for (const [m, r] of Object.entries(methodMap)) {
    if (!METHODS.includes(m)) {
      data.push({
        method: m,
        totalAmount: Number(r.totalAmount),
        grossAmount: Number(r.grossAmount),
        refundTotal: Number(r.refundTotal),
        jumlahTransaksi: r.jumlahTransaksi,
      });
    }
  }

  return res.json({ data });
});

/**
 * GET /api/laporan/rekap-payments?tahun=2026&bulan=&limit=50&offset=0
 * Daftar transaksi pembayaran dengan filter lengkap.
 * Void payments dikecualikan.
 */
router.get("/laporan/rekap-payments", async (req, res) => {
  const {
    tahun: tahunRaw,
    bulan: bulanRaw,
    limit: limitRaw,
    offset: offsetRaw,
    tenant_id,
    floor,
    payment_method,
    status,
    dari,
    sampai,
  } = req.query;

  const tahun = tahunRaw ? parseInt(String(tahunRaw), 10) : new Date().getFullYear();
  const bulan = bulanRaw ? parseInt(String(bulanRaw), 10) : null;
  const limit = limitRaw ? Math.min(parseInt(String(limitRaw), 10), 200) : 100;
  const offset = offsetRaw ? parseInt(String(offsetRaw), 10) : 0;

  if (isNaN(tahun)) {
    return res.status(400).json({ error: "Parameter tahun tidak valid" });
  }

  // Build where clause - always exclude void
  let whereClause = sql`(tp.is_voided = false OR tp.is_voided IS NULL)`;

  if (req.siteId > 0) {
    whereClause = sql`${whereClause} AND tp.site_id = ${req.siteId}`;
  }

  if (dari && sampai) {
    whereClause = sql`${whereClause}
      AND DATE(tp.paid_at) >= ${String(dari)}
      AND DATE(tp.paid_at) <= ${String(sampai)}`;
  } else {
    whereClause = sql`${whereClause}
      AND EXTRACT(YEAR FROM tp.paid_at) = ${tahun}`;
    if (bulan && !isNaN(bulan) && bulan >= 1 && bulan <= 12) {
      whereClause = sql`${whereClause}
        AND EXTRACT(MONTH FROM tp.paid_at) = ${bulan}`;
    }
  }

  if (tenant_id && !isNaN(parseInt(String(tenant_id), 10))) {
    whereClause = sql`${whereClause} AND tp.tenant_id = ${parseInt(String(tenant_id), 10)}`;
  }
  if (floor) {
    whereClause = sql`${whereClause} AND tb.floor = ${String(floor)}`;
  }
  if (payment_method) {
    whereClause = sql`${whereClause} AND tp.payment_method = ${String(payment_method)}`;
  }
  if (status) {
    whereClause = sql`${whereClause} AND UPPER(tp.payment_status) = ${String(status).toUpperCase()}`;
  }

  const rows = await db.execute(sql`
    SELECT
      tp.id,
      tp.receipt_number,
      tp.paid_at,
      tp.amount::numeric AS amount,
      tp.discount_amount::numeric AS discount_amount,
      tp.penalty_amount::numeric AS penalty_amount,
      tp.refund_amount::numeric AS refund_amount,
      tp.refund_reason,
      tp.payment_method,
      tp.payment_status,
      tp.is_voided,
      tp.notes,
      tp.booking_id,
      tb.period_label,
      tb.floor,
      te.id AS tenant_id,
      te.business_name,
      te.owner_name,
      te.booth_number,
      te.area_name,
      te.category
    FROM tenant_payments tp
    LEFT JOIN tenant_bookings tb ON tb.id = tp.booking_id
    LEFT JOIN tenants te ON te.id = tp.tenant_id
    WHERE ${whereClause}
    ORDER BY tp.paid_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `);

  const totalRow = await db.execute(sql`
    SELECT COUNT(*)::int AS total
    FROM tenant_payments tp
    LEFT JOIN tenant_bookings tb ON tb.id = tp.booking_id
    LEFT JOIN tenants te ON te.id = tp.tenant_id
    WHERE ${whereClause}
  `);

  const rekapArr = ((rows as any).rows ?? rows) as any[];
  const rekapTotalArr = ((totalRow as any).rows ?? totalRow) as any[];

  const data = rekapArr.map((r) => ({
    id: r.id,
    receiptNumber: r.receipt_number ?? `PAY-${r.id}`,
    paymentDate: r.paid_at,
    tenantId: r.tenant_id,
    bookingId: r.booking_id,
    businessName: r.business_name ?? "-",
    ownerName: r.owner_name ?? "-",
    boothNumber: r.booth_number ?? "-",
    areaName: r.area_name ?? "-",
    floor: r.floor ?? "-",
    category: r.category ?? "-",
    periodLabel: r.period_label ?? "-",
    paymentMethod: r.payment_method ?? "other",
    amountPaid: Number(r.amount ?? 0),
    discountAmount: Number(r.discount_amount ?? 0),
    penaltyAmount: Number(r.penalty_amount ?? 0),
    refundAmount: Number(r.refund_amount ?? 0),
    netAmount: Number(r.amount ?? 0) - Number(r.refund_amount ?? 0),
    paymentStatus: r.payment_status ?? "-",
    notes: r.notes ?? "",
    source: "TENANT_POS_PAYMENT" as const,
    debitAccount: (r.payment_method === "tunai") ? "Kas" : "Bank / Transfer",
    creditAccount: "Pendapatan Sewa Tenant",
  }));

  return res.json({
    data,
    pagination: {
      total: rekapTotalArr[0]?.total ?? 0,
      limit,
      offset,
    },
    tahun,
    bulan: bulan ?? null,
  });
});

/**
 * GET /api/laporan/tenants-list
 * Daftar tenant untuk dropdown filter
 */
router.get("/laporan/tenants-list", async (req, res) => {
  const siteFilter = req.siteId > 0 ? eq(tenantsTable.siteId, req.siteId) : undefined;
  const rows = await db
    .select({ id: tenantsTable.id, businessName: tenantsTable.businessName })
    .from(tenantsTable)
    .where(siteFilter)
    .orderBy(tenantsTable.businessName);
  return res.json(rows);
});

/**
 * GET /api/laporan/floors-list
 * Daftar lantai unik untuk dropdown filter
 */
router.get("/laporan/floors-list", async (req, res) => {
  const floorsSiteClause = req.siteId > 0 ? sql`AND site_id = ${req.siteId}` : sql``;
  const rows = await db.execute(sql`
    SELECT DISTINCT floor FROM tenant_bookings
    WHERE floor IS NOT NULL AND floor != '' ${floorsSiteClause}
    ORDER BY floor
  `);
  const floorsArr = ((rows as any).rows ?? rows) as any[];
  return res.json(floorsArr.map((r) => r.floor));
});

/**
 * GET /api/laporan/tren-bulanan
 * Tren tagihan & pembayaran per bulan, per lokasi
 */
router.get("/laporan/tren-bulanan", async (req, res) => {
  const siteId = req.siteId;
  try {
    const rows = await db.execute(sql`
      SELECT
        TO_CHAR(DATE_TRUNC('month', ti.period_start), 'YYYY-MM') AS bulan_key,
        TO_CHAR(DATE_TRUNC('month', ti.period_start), 'Mon YYYY') AS bulan_label,
        s.id   AS site_id,
        s.name AS site_name,
        s.type AS site_type,
        SUM(ti.total_amount)::numeric       AS total_tagihan,
        SUM(ti.paid_amount)::numeric        AS total_bayar,
        SUM(ti.outstanding_amount)::numeric AS total_tunggakan,
        COUNT(*)::int                       AS jumlah_invoice,
        COUNT(*) FILTER (WHERE ti.status = 'paid')::int    AS lunas,
        COUNT(*) FILTER (WHERE ti.status = 'overdue')::int AS menunggak,
        COUNT(*) FILTER (WHERE ti.status IN ('unpaid','partial'))::int AS belum_bayar
      FROM tenant_invoices ti
      JOIN mall_sites s ON s.id = ti.site_id
      WHERE ti.period_start >= DATE_TRUNC('month', NOW()) - INTERVAL '11 months'
        ${siteId > 0 ? sql`AND ti.site_id = ${siteId}` : sql``}
      GROUP BY DATE_TRUNC('month', ti.period_start), s.id, s.name, s.type
      ORDER BY DATE_TRUNC('month', ti.period_start), s.id
    `);

    const data = ((rows as any).rows ?? rows) as any[];
    res.json(data.map((r: any) => ({
      bulanKey:      r.bulan_key,
      bulanLabel:    r.bulan_label,
      siteId:        Number(r.site_id),
      siteName:      r.site_name,
      siteType:      r.site_type,
      totalTagihan:  Number(r.total_tagihan),
      totalBayar:    Number(r.total_bayar),
      totalTunggakan:Number(r.total_tunggakan),
      jumlahInvoice: Number(r.jumlah_invoice),
      lunas:         Number(r.lunas),
      menunggak:     Number(r.menunggak),
      belumBayar:    Number(r.belum_bayar),
    })));
  } catch (err) {
    req.log.error(err, "Failed to get tren bulanan");
    res.status(500).json({ error: "Gagal mengambil tren bulanan" });
  }
});

/**
 * GET /api/laporan/rekap-tenant
 * Rekap per-tenant: status kontrak, tagihan, pembayaran, tunggakan
 */
router.get("/laporan/rekap-tenant", async (req, res) => {
  const siteId = req.siteId;
  const siteClause = siteId > 0 ? `AND t.site_id = ${siteId}` : "";

  try {
    const rows = await db.execute(sql`
      SELECT
        t.id                          AS tenant_id,
        t.business_name,
        t.owner_name,
        t.phone,
        COALESCE(t.category, t.business_category) AS category,
        t.status                      AS tenant_status,
        t.site_id,
        s.name                        AS site_name,
        s.type                        AS site_type,

        -- Booking terbaru (utamakan active)
        b.id                          AS booking_id,
        b.unit_code,
        b.contract_status,
        b.payment_status              AS booking_payment_status,
        b.start_date,
        b.end_date,
        b.due_date,
        b.price                       AS monthly_rent,
        b.period_label,

        -- Agregasi invoice
        COALESCE(inv.total_billed, 0)     AS total_billed,
        COALESCE(inv.total_paid, 0)       AS total_paid,
        COALESCE(inv.total_outstanding, 0) AS total_outstanding,
        COALESCE(inv.inv_count, 0)        AS invoice_count,
        COALESCE(inv.paid_count, 0)       AS paid_count,
        COALESCE(inv.overdue_count, 0)    AS overdue_count,
        COALESCE(inv.unpaid_count, 0)     AS unpaid_count,

        -- Pembayaran terakhir
        pay.last_paid_at,
        pay.last_paid_amount

      FROM tenants t
      LEFT JOIN mall_sites s ON s.id = t.site_id
      LEFT JOIN LATERAL (
        SELECT * FROM tenant_bookings tb
        WHERE tb.tenant_id = t.id
        ORDER BY
          CASE tb.contract_status
            WHEN 'active'        THEN 1
            WHEN 'expiring_soon' THEN 2
            WHEN 'draft'         THEN 3
            WHEN 'expired'       THEN 4
            ELSE 5
          END,
          tb.id DESC
        LIMIT 1
      ) b ON true
      LEFT JOIN LATERAL (
        SELECT
          SUM(total_amount)::numeric                               AS total_billed,
          SUM(paid_amount)::numeric                                AS total_paid,
          SUM(outstanding_amount)::numeric                         AS total_outstanding,
          COUNT(*)::int                                            AS inv_count,
          COUNT(*) FILTER (WHERE status = 'paid')::int             AS paid_count,
          COUNT(*) FILTER (WHERE status = 'overdue')::int          AS overdue_count,
          COUNT(*) FILTER (WHERE status IN ('unpaid','partial'))::int AS unpaid_count
        FROM tenant_invoices ti
        WHERE ti.tenant_id = t.id
      ) inv ON true
      LEFT JOIN LATERAL (
        SELECT MAX(paid_at) AS last_paid_at, (ARRAY_AGG(amount ORDER BY paid_at DESC))[1] AS last_paid_amount
        FROM tenant_payments tp
        WHERE tp.tenant_id = t.id
          AND (tp.is_voided = false OR tp.is_voided IS NULL)
      ) pay ON true
      WHERE t.status NOT IN ('blacklisted')
        ${siteId > 0 ? sql`AND t.site_id = ${siteId}` : sql``}
      ORDER BY s.id, t.business_name
    `);

    const data = ((rows as any).rows ?? rows) as any[];

    const result = data.map((r: any) => ({
      tenantId:             Number(r.tenant_id),
      businessName:         r.business_name,
      ownerName:            r.owner_name,
      phone:                r.phone,
      category:             r.category,
      tenantStatus:         r.tenant_status,
      siteId:               Number(r.site_id),
      siteName:             r.site_name,
      siteType:             r.site_type,
      bookingId:            r.booking_id ? Number(r.booking_id) : null,
      unitCode:             r.unit_code,
      contractStatus:       r.contract_status,
      bookingPaymentStatus: r.booking_payment_status,
      startDate:            r.start_date,
      endDate:              r.end_date,
      dueDate:              r.due_date,
      monthlyRent:          r.monthly_rent ? Number(r.monthly_rent) : 0,
      periodLabel:          r.period_label,
      totalBilled:          Number(r.total_billed),
      totalPaid:            Number(r.total_paid),
      totalOutstanding:     Number(r.total_outstanding),
      invoiceCount:         Number(r.invoice_count),
      paidCount:            Number(r.paid_count),
      overdueCount:         Number(r.overdue_count),
      unpaidCount:          Number(r.unpaid_count),
      lastPaidAt:           r.last_paid_at ?? null,
      lastPaidAmount:       r.last_paid_amount ? Number(r.last_paid_amount) : null,
    }));

    res.json(result);
  } catch (err) {
    req.log.error(err, "Failed to get rekap tenant");
    res.status(500).json({ error: "Gagal mengambil rekap tenant" });
  }
});

/**
 * GET /api/laporan/rekonsiliasi?tahun=2026&dari=&sampai=&groupBy=bulan|harian
 * Ringkasan rekonsiliasi per periode untuk keperluan audit.
 * Kolom: periodeKey, periodeLabel, totalMutasi, totalMatched, totalTagihan, totalBayar, totalOutstanding, collectionRate
 */
router.get("/laporan/rekonsiliasi", async (req, res) => {
  const { tahun: tahunRaw, dari, sampai, groupBy: groupByRaw } = req.query;
  const tahun = tahunRaw ? parseInt(String(tahunRaw), 10) : new Date().getFullYear();
  const groupBy = String(groupByRaw ?? "bulan") === "harian" ? "harian" : "bulan";
  const siteId = req.siteId;

  if (isNaN(tahun)) {
    return res.status(400).json({ error: "Parameter tahun tidak valid" });
  }

  let dateClause: ReturnType<typeof sql>;
  if (dari && sampai) {
    dateClause = sql`ti.period_start >= ${String(dari)} AND ti.period_start <= ${String(sampai)}`;
  } else {
    dateClause = sql`EXTRACT(YEAR FROM ti.period_start) = ${tahun}`;
  }

  const siteClause = siteId > 0 ? sql`AND ti.site_id = ${siteId}` : sql``;

  const truncExpr = groupBy === "harian"
    ? sql`DATE_TRUNC('day', ti.period_start)`
    : sql`DATE_TRUNC('month', ti.period_start)`;

  const fmtExpr = groupBy === "harian"
    ? sql`TO_CHAR(DATE_TRUNC('day', ti.period_start), 'DD Mon YYYY')`
    : sql`TO_CHAR(DATE_TRUNC('month', ti.period_start), 'Mon YYYY')`;

  const keyExpr = groupBy === "harian"
    ? sql`TO_CHAR(DATE_TRUNC('day', ti.period_start), 'YYYY-MM-DD')`
    : sql`TO_CHAR(DATE_TRUNC('month', ti.period_start), 'YYYY-MM')`;

  const rows = await db.execute(sql`
    SELECT
      ${keyExpr}                                                        AS periode_key,
      ${fmtExpr}                                                        AS periode_label,
      ${truncExpr}                                                       AS periode_sort,
      COUNT(*)::int                                                      AS total_mutasi,
      COUNT(*) FILTER (WHERE ti.status = 'paid')::int                   AS total_matched,
      SUM(ti.total_amount)::numeric                                      AS total_tagihan,
      SUM(ti.paid_amount)::numeric                                       AS total_bayar,
      SUM(ti.outstanding_amount)::numeric                                AS total_outstanding,
      COUNT(*) FILTER (WHERE ti.status = 'overdue')::int                 AS total_overdue,
      COUNT(*) FILTER (WHERE ti.status IN ('unpaid','partial'))::int     AS total_belum_bayar
    FROM tenant_invoices ti
    WHERE ${dateClause} ${siteClause}
      AND ti.status != 'cancelled'
    GROUP BY ${truncExpr}, ${keyExpr}, ${fmtExpr}
    ORDER BY ${truncExpr}
  `);

  const data = ((rows as any).rows ?? rows) as any[];

  const result = data.map((r: any) => {
    const tagihan = Number(r.total_tagihan ?? 0);
    const bayar = Number(r.total_bayar ?? 0);
    return {
      periodeKey:       r.periode_key,
      periodeLabel:     r.periode_label,
      totalMutasi:      Number(r.total_mutasi),
      totalMatched:     Number(r.total_matched),
      totalTagihan:     tagihan,
      totalBayar:       bayar,
      totalOutstanding: Number(r.total_outstanding ?? 0),
      totalOverdue:     Number(r.total_overdue ?? 0),
      totalBelumBayar:  Number(r.total_belum_bayar ?? 0),
      collectionRate:   tagihan > 0 ? Math.round((bayar / tagihan) * 100) : 0,
    };
  });

  const grand = result.reduce(
    (acc, r) => ({
      totalMutasi:      acc.totalMutasi + r.totalMutasi,
      totalMatched:     acc.totalMatched + r.totalMatched,
      totalTagihan:     acc.totalTagihan + r.totalTagihan,
      totalBayar:       acc.totalBayar + r.totalBayar,
      totalOutstanding: acc.totalOutstanding + r.totalOutstanding,
    }),
    { totalMutasi: 0, totalMatched: 0, totalTagihan: 0, totalBayar: 0, totalOutstanding: 0 },
  );

  return res.json({
    data: result,
    grand: {
      ...grand,
      collectionRate: grand.totalTagihan > 0
        ? Math.round((grand.totalBayar / grand.totalTagihan) * 100)
        : 0,
    },
    tahun,
    dari: dari ? String(dari) : null,
    sampai: sampai ? String(sampai) : null,
    groupBy,
  });
});

/**
 * GET /api/laporan/rekap-iuran-sampah?tahun=2026&bulan=&dari=&sampai=&tenant_id=
 * Rekap iuran sampah/kebersihan per tenant dari tenant_invoices.
 * Menampilkan total tagihan, terbayar, dan tertunggak per tenant.
 */
router.get("/laporan/rekap-iuran-sampah", async (req, res) => {
  const { tahun: tahunRaw, bulan: bulanRaw, dari, sampai, tenant_id } = req.query;
  const tahun = tahunRaw ? parseInt(String(tahunRaw), 10) : new Date().getFullYear();
  const bulan = bulanRaw ? parseInt(String(bulanRaw), 10) : null;
  const siteId = req.siteId;

  if (isNaN(tahun)) {
    return res.status(400).json({ error: "Parameter tahun tidak valid" });
  }

  let whereClause = sql`ti.status != 'cancelled' AND ti.trash_charge_amount > 0`;

  if (siteId > 0) {
    whereClause = sql`${whereClause} AND ti.site_id = ${siteId}`;
  }

  if (dari && sampai) {
    whereClause = sql`${whereClause}
      AND ti.period_start >= ${String(dari)}
      AND ti.period_start <= ${String(sampai)}`;
  } else {
    whereClause = sql`${whereClause}
      AND EXTRACT(YEAR FROM COALESCE(ti.period_start, ti.due_date)) = ${tahun}`;
    if (bulan && !isNaN(bulan) && bulan >= 1 && bulan <= 12) {
      whereClause = sql`${whereClause}
        AND EXTRACT(MONTH FROM COALESCE(ti.period_start, ti.due_date)) = ${bulan}`;
    }
  }

  if (tenant_id && !isNaN(parseInt(String(tenant_id), 10))) {
    whereClause = sql`${whereClause} AND ti.tenant_id = ${parseInt(String(tenant_id), 10)}`;
  }

  try {
    const rows = await db.execute(sql`
      SELECT
        te.id                                                                  AS tenant_id,
        te.business_name,
        te.owner_name,
        COALESCE(ti.unit_code, tb.unit_code, te.booth_number)                 AS unit_code,
        COUNT(*)::int                                                          AS jumlah_invoice,
        SUM(ti.trash_charge_amount)::numeric                                   AS total_iuran,
        SUM(CASE WHEN ti.status = 'paid'
              THEN ti.trash_charge_amount ELSE 0 END)::numeric                 AS iuran_terbayar,
        SUM(CASE WHEN ti.status NOT IN ('paid','cancelled')
              THEN ti.trash_charge_amount ELSE 0 END)::numeric                 AS iuran_tertunggak,
        MIN(ti.period_start)                                                   AS periode_awal,
        MAX(ti.period_end)                                                     AS periode_akhir
      FROM tenant_invoices ti
      JOIN tenants te ON te.id = ti.tenant_id
      LEFT JOIN tenant_bookings tb ON tb.id = ti.booking_id
      WHERE ${whereClause}
      GROUP BY te.id, te.business_name, te.owner_name,
               COALESCE(ti.unit_code, tb.unit_code, te.booth_number)
      ORDER BY SUM(ti.trash_charge_amount) DESC
    `);

    const data = ((rows as any).rows ?? rows) as any[];

    const mapped = data.map((r: any) => ({
      tenantId:       Number(r.tenant_id),
      businessName:   r.business_name ?? "-",
      ownerName:      r.owner_name ?? "-",
      unitCode:       r.unit_code ?? "-",
      jumlahInvoice:  Number(r.jumlah_invoice),
      totalIuran:     Number(r.total_iuran ?? 0),
      iuranTerbayar:  Number(r.iuran_terbayar ?? 0),
      iuranTertunggak: Number(r.iuran_tertunggak ?? 0),
      periodeAwal:    r.periode_awal ?? null,
      periodeAkhir:   r.periode_akhir ?? null,
    }));

    const grand = mapped.reduce(
      (acc, r) => ({
        jumlahInvoice:  acc.jumlahInvoice + r.jumlahInvoice,
        totalIuran:     acc.totalIuran + r.totalIuran,
        iuranTerbayar:  acc.iuranTerbayar + r.iuranTerbayar,
        iuranTertunggak: acc.iuranTertunggak + r.iuranTertunggak,
      }),
      { jumlahInvoice: 0, totalIuran: 0, iuranTerbayar: 0, iuranTertunggak: 0 },
    );

    return res.json({
      data: mapped,
      grand,
      tahun,
      bulan: bulan ?? null,
    });
  } catch (err) {
    req.log.error(err, "Failed to get rekap iuran sampah");
    return res.status(500).json({ error: "Gagal mengambil rekap iuran sampah" });
  }
});

export default router;


