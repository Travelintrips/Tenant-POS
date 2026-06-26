import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  tenantsTable,
  tenantInvoicesTable,
  tenantPaymentsTable,
  mallUnitsTable,
  operationalExpensesTable,
  mallSitesTable,
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
 * GET /api/dashboard/export-monthly-pdf?month=YYYY-MM
 * Generate laporan bulanan PDF: invoice terbayar + pengeluaran operasional.
 */
router.get("/dashboard/export-monthly-pdf", async (req, res) => {
  try {
    const siteId = req.siteId;

    // Parse bulan dari query
    const monthParam = typeof req.query.month === "string" ? req.query.month : null;
    const now = new Date();
    let year  = now.getFullYear();
    let month = now.getMonth() + 1;
    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      const [y, m] = monthParam.split("-").map(Number);
      if (y >= 2020 && y <= 2100 && m >= 1 && m <= 12) { year = y; month = m; }
    }
    const monthStr = `${year}-${String(month).padStart(2, "0")}`;
    const BULAN_ID = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
    const monthLabel = `${BULAN_ID[month - 1]} ${year}`;

    // Nama site
    let siteName = "Semua Lokasi";
    if (siteId > 0) {
      const siteRows = await db.select({ name: mallSitesTable.name }).from(mallSitesTable).where(eq(mallSitesTable.id, siteId));
      siteName = siteRows[0]?.name ?? siteName;
    }


    // Query invoice lunas bulan ini dengan detail tenant
    const invoiceRows = await db.execute(sql`
      SELECT
        ti.invoice_number,
        ti.paid_amount,
        ti.period_start,
        ti.period_end,
        ti.updated_at AS paid_at,
        t.business_name,
        t.unit_code
      FROM tenant_invoices ti
      LEFT JOIN tenants t ON t.id = ti.tenant_id
      WHERE ti.status = 'paid'
        AND EXTRACT(YEAR  FROM ti.updated_at) = ${year}
        AND EXTRACT(MONTH FROM ti.updated_at) = ${month}
        ${siteId > 0 ? sql`AND ti.site_id = ${siteId}` : sql``}
      ORDER BY ti.updated_at DESC
    `);

    // Query pengeluaran operasional bulan ini
    const expRows = await db.execute(sql`
      SELECT
        category,
        coa_name,
        description,
        amount,
        payment_method,
        paid_at
      FROM operational_expenses
      WHERE EXTRACT(YEAR  FROM paid_at) = ${year}
        AND EXTRACT(MONTH FROM paid_at) = ${month}
        ${siteId > 0 ? sql`AND site_id = ${siteId}` : sql``}
      ORDER BY paid_at DESC
    `);

    type InvRow = { invoice_number: string; paid_amount: string; period_start: string; period_end: string; paid_at: string; business_name: string | null; unit_code: string | null };
    type ExpRow = { category: string; coa_name: string | null; description: string | null; amount: string; payment_method: string; paid_at: string };

    const invoices = ((invoiceRows as unknown as { rows: InvRow[] }).rows) ?? [];
    const expenses = ((expRows as unknown as { rows: ExpRow[] }).rows) ?? [];

    const totalInvoice = invoices.reduce((s, r) => s + Number(r.paid_amount ?? 0), 0);
    const totalExpense = expenses.reduce((s, r) => s + Number(r.amount ?? 0), 0);

    // ── Generate PDF ──────────────────────────────────────────────────────
    // pdfkit is external (esbuild), loaded via require()
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const pdfkitMod = require("pdfkit") as any;
    const PDFDocument: new (opts?: object) => any = pdfkitMod.default ?? pdfkitMod;

    const doc = new PDFDocument({ margin: 40, size: "A4" });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="laporan-${monthStr}.pdf"`);
    doc.pipe(res);

    const W = doc.page.width - 80; // usable width
    const PURPLE = "#7c3aed";
    const GRAY   = "#6b7280";
    const LIGHT  = "#f5f3ff";

    const formatRp = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;
    const fmtDate  = (d: string) => {
      try { return new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }); }
      catch { return d; }
    };

    // ── Header ────────────────────────────────────────────────────────────
    doc.rect(40, 40, W, 56).fill(PURPLE);
    doc.fillColor("white")
       .font("Helvetica-Bold").fontSize(14).text("LAPORAN BULANAN", 52, 52, { width: W - 20 })
       .font("Helvetica").fontSize(10).text(`${siteName}  ·  ${monthLabel}`, 52, 72);
    doc.fillColor(GRAY).font("Helvetica").fontSize(8)
       .text(`Digenerate: ${now.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}  pukul  ${now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}`, 52, 87);
    doc.moveDown(0.3);

    // ── Summary boxes ─────────────────────────────────────────────────────
    const bY = 110;
    const bW = (W - 16) / 3;
    const boxes = [
      { label: "Invoice Terbayar",    val: `${invoices.length} invoice`,   sub: formatRp(totalInvoice), color: PURPLE },
      { label: "Pengeluaran",         val: formatRp(totalExpense),          sub: `${expenses.length} transaksi`,  color: "#dc2626" },
      { label: "Net Pendapatan",      val: formatRp(totalInvoice - totalExpense), sub: "invoice − pengeluaran",   color: totalInvoice >= totalExpense ? "#16a34a" : "#dc2626" },
    ];
    boxes.forEach((b, i) => {
      const x = 40 + i * (bW + 8);
      doc.rect(x, bY, bW, 52).fill(LIGHT).stroke("#e9d5ff");
      doc.fillColor(b.color).font("Helvetica-Bold").fontSize(11).text(b.val, x + 6, bY + 8, { width: bW - 12 });
      doc.fillColor("#374151").font("Helvetica").fontSize(8).text(b.label, x + 6, bY + 26, { width: bW - 12 });
      doc.fillColor(GRAY).fontSize(7.5).text(b.sub, x + 6, bY + 38, { width: bW - 12 });
    });

    doc.y = bY + 62;

    // ── Helper: draw table ────────────────────────────────────────────────
    const drawTable = (title: string, headers: string[], colWidths: number[], rows: string[][], totalLine?: string) => {
      if (doc.y > 680) doc.addPage();
      doc.moveDown(0.4);
      doc.fillColor(PURPLE).font("Helvetica-Bold").fontSize(10).text(title, { underline: false });
      doc.moveDown(0.2);

      let cx = 40;
      const headerY = doc.y;
      doc.rect(40, headerY, W, 16).fill("#ede9fe");
      headers.forEach((h, i) => {
        doc.fillColor("#374151").font("Helvetica-Bold").fontSize(7.5).text(h, cx + 3, headerY + 4, { width: colWidths[i] - 6, lineBreak: false });
        cx += colWidths[i];
      });
      doc.y = headerY + 16;

      if (rows.length === 0) {
        doc.fillColor(GRAY).font("Helvetica").fontSize(8).text("Tidak ada data.", 44, doc.y + 4);
        doc.moveDown(0.6);
      }

      rows.forEach((row, ri) => {
        if (doc.y > 750) doc.addPage();
        const rowY = doc.y;
        const bg = ri % 2 === 0 ? "white" : "#faf5ff";
        const rowH = 16;
        doc.rect(40, rowY, W, rowH).fill(bg);
        let rx = 40;
        row.forEach((cell, ci) => {
          doc.fillColor("#1f2937").font("Helvetica").fontSize(7.5)
             .text(cell, rx + 3, rowY + 4, { width: colWidths[ci] - 6, lineBreak: false, ellipsis: true });
          rx += colWidths[ci];
        });
        doc.y = rowY + rowH;
      });

      if (totalLine) {
        const ty = doc.y;
        doc.rect(40, ty, W, 16).fill("#ede9fe");
        doc.fillColor(PURPLE).font("Helvetica-Bold").fontSize(8).text(totalLine, 44, ty + 4, { width: W - 8 });
        doc.y = ty + 16;
      }
    };

    // ── Tabel Invoice Terbayar ────────────────────────────────────────────
    const invHeaders = ["No", "Nama Tenant", "Unit", "Periode", "Tgl Lunas", "Jumlah"];
    const invWidths  = [24, 140, 60, 90, 74, W - 24 - 140 - 60 - 90 - 74];
    const invRows = invoices.map((r, i) => [
      String(i + 1),
      r.business_name ?? "-",
      r.unit_code ?? "-",
      `${fmtDate(r.period_start)} – ${fmtDate(r.period_end)}`,
      fmtDate(r.paid_at),
      formatRp(Number(r.paid_amount ?? 0)),
    ]);
    drawTable("Invoice Terbayar", invHeaders, invWidths, invRows,
      `Total: ${invoices.length} invoice  ·  ${formatRp(totalInvoice)}`);

    // ── Tabel Pengeluaran Operasional ─────────────────────────────────────
    const expHeaders = ["No", "Kategori", "Keterangan", "Metode", "Tgl", "Jumlah"];
    const expWidths  = [24, 80, 180, 60, 70, W - 24 - 80 - 180 - 60 - 70];
    const expTableRows = expenses.map((r, i) => [
      String(i + 1),
      r.coa_name ?? r.category ?? "-",
      r.description ?? "-",
      r.payment_method,
      fmtDate(r.paid_at),
      formatRp(Number(r.amount ?? 0)),
    ]);
    drawTable("Pengeluaran Operasional", expHeaders, expWidths, expTableRows,
      `Total: ${expenses.length} transaksi  ·  ${formatRp(totalExpense)}`);

    // ── Footer ────────────────────────────────────────────────────────────
    const pages = doc.bufferedPageRange ? doc.bufferedPageRange() : { count: 1 };
    if (pages.count) {
      for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);
        doc.fillColor(GRAY).fontSize(7).text(
          `Laporan ${monthLabel} · ${siteName} · Halaman ${i + 1} dari ${pages.count}`,
          40, doc.page.height - 30, { width: W, align: "center" },
        );
      }
    }

    doc.end();
  } catch (err) {
    req.log.error(err, "[export-monthly-pdf] Gagal generate PDF");
    if (!res.headersSent) res.status(500).json({ error: "Gagal membuat laporan PDF" });
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
