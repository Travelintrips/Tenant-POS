import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  tenantsTable,
  tenantBookingsTable,
  tenantPaymentsTable,
} from "@workspace/db/schema";
import { eq, sql, desc, and, gte, lt, lte } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

const BULAN_LABEL = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"];

/**
 * GET /api/laporan/summary?tahun=2026
 * Ringkasan bulanan pendapatan sewa tenant untuk tahun tertentu.
 */
router.get("/laporan/summary", async (req, res) => {
  const tahunRaw = req.query.tahun;
  const tahun = tahunRaw ? parseInt(String(tahunRaw), 10) : new Date().getFullYear();

  if (isNaN(tahun)) {
    return res.status(400).json({ error: "Parameter tahun tidak valid" });
  }

  const rows = await db
    .select({
      bulanNum: sql<number>`EXTRACT(MONTH FROM ${tenantPaymentsTable.paidAt})::int`,
      totalAmount: sql<number>`SUM(${tenantPaymentsTable.amount})::int`,
      jumlahTransaksi: sql<number>`COUNT(*)::int`,
    })
    .from(tenantPaymentsTable)
    .where(sql`EXTRACT(YEAR FROM ${tenantPaymentsTable.paidAt}) = ${tahun}`)
    .groupBy(sql`EXTRACT(MONTH FROM ${tenantPaymentsTable.paidAt})`)
    .orderBy(sql`EXTRACT(MONTH FROM ${tenantPaymentsTable.paidAt})`);

  const bulanMap: Record<number, { totalAmount: number; jumlahTransaksi: number }> = {};
  for (const row of rows) {
    bulanMap[row.bulanNum] = {
      totalAmount: row.totalAmount,
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

  const totalPendapatan = rows.reduce((s, r) => s + r.totalAmount, 0);
  const totalTransaksi = rows.reduce((s, r) => s + r.jumlahTransaksi, 0);

  const tunggakanRows = await db
    .select({
      totalTunggakan: sql<number>`SUM(${tenantBookingsTable.remainingAmount})::int`,
      jumlahTunggakan: sql<number>`COUNT(*)::int`,
    })
    .from(tenantBookingsTable)
    .where(
      sql`${tenantBookingsTable.paymentStatus} IN ('UNPAID', 'PARTIAL', 'OVERDUE')`
    );

  return res.json({
    tahun,
    monthly,
    totalPendapatan,
    totalTransaksi,
    tunggakan: {
      totalTunggakan: tunggakanRows[0]?.totalTunggakan ?? 0,
      jumlahUnit: tunggakanRows[0]?.jumlahTunggakan ?? 0,
    },
  });
});

/**
 * GET /api/laporan/rekap-payments?tahun=2026&bulan=&limit=50&offset=0
 * Daftar transaksi pembayaran tenant dengan detail lengkap.
 * Source: TENANT_POS_PAYMENT (setiap record = 1 transaksi keuangan)
 */
router.get("/laporan/rekap-payments", async (req, res) => {
  const tahunRaw = req.query.tahun;
  const bulanRaw = req.query.bulan;
  const limitRaw = req.query.limit;
  const offsetRaw = req.query.offset;

  const tahun = tahunRaw ? parseInt(String(tahunRaw), 10) : new Date().getFullYear();
  const bulan = bulanRaw ? parseInt(String(bulanRaw), 10) : null;
  const limit = limitRaw ? Math.min(parseInt(String(limitRaw), 10), 200) : 100;
  const offset = offsetRaw ? parseInt(String(offsetRaw), 10) : 0;

  if (isNaN(tahun)) {
    return res.status(400).json({ error: "Parameter tahun tidak valid" });
  }

  let whereExpr = sql`EXTRACT(YEAR FROM ${tenantPaymentsTable.paidAt}) = ${tahun}`;
  if (bulan && !isNaN(bulan) && bulan >= 1 && bulan <= 12) {
    whereExpr = sql`EXTRACT(YEAR FROM ${tenantPaymentsTable.paidAt}) = ${tahun}
      AND EXTRACT(MONTH FROM ${tenantPaymentsTable.paidAt}) = ${bulan}`;
  }

  const rows = await db
    .select({
      id: tenantPaymentsTable.id,
      receiptNumber: tenantPaymentsTable.receiptNumber,
      paidAt: tenantPaymentsTable.paidAt,
      amount: tenantPaymentsTable.amount,
      discountAmount: tenantPaymentsTable.discountAmount,
      penaltyAmount: tenantPaymentsTable.penaltyAmount,
      paymentMethod: tenantPaymentsTable.paymentMethod,
      paymentStatus: tenantPaymentsTable.paymentStatus,
      notes: tenantPaymentsTable.notes,
      bookingId: tenantPaymentsTable.bookingId,
      periodLabel: tenantBookingsTable.periodLabel,
      tenantId: tenantBookingsTable.tenantId,
      businessName: tenantsTable.businessName,
      ownerName: tenantsTable.ownerName,
      boothNumber: tenantsTable.boothNumber,
      areaName: tenantsTable.areaName,
      category: tenantsTable.category,
    })
    .from(tenantPaymentsTable)
    .innerJoin(tenantBookingsTable, eq(tenantPaymentsTable.bookingId, tenantBookingsTable.id))
    .innerJoin(tenantsTable, eq(tenantBookingsTable.tenantId, tenantsTable.id))
    .where(whereExpr)
    .orderBy(desc(tenantPaymentsTable.paidAt))
    .limit(limit)
    .offset(offset);

  const totalRow = await db
    .select({ total: sql<number>`COUNT(*)::int` })
    .from(tenantPaymentsTable)
    .where(whereExpr);

  const data = rows.map((r) => ({
    id: r.id,
    receiptNumber: r.receiptNumber ?? `PAY-${r.id}`,
    paymentDate: r.paidAt,
    tenantId: r.tenantId,
    bookingId: r.bookingId,
    businessName: r.businessName,
    ownerName: r.ownerName,
    boothNumber: r.boothNumber ?? "-",
    areaName: r.areaName,
    category: r.category ?? "-",
    periodLabel: r.periodLabel ?? "-",
    paymentMethod: r.paymentMethod,
    amountPaid: r.amount,
    discountAmount: r.discountAmount,
    penaltyAmount: r.penaltyAmount,
    paymentStatus: r.paymentStatus,
    notes: r.notes ?? "",
    source: "TENANT_POS_PAYMENT" as const,
    debitAccount: r.paymentMethod === "tunai" ? "Kas" : "Bank / Transfer",
    creditAccount: "Pendapatan Sewa Tenant",
  }));

  return res.json({
    data,
    pagination: {
      total: totalRow[0]?.total ?? 0,
      limit,
      offset,
    },
    tahun,
    bulan: bulan ?? null,
  });
});

export default router;
