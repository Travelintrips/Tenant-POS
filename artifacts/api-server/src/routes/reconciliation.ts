import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { tenantInvoicesTable, tenantsTable } from "@workspace/db/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { writeToSheet, readFromSheet, extractSheetId, getServiceAccountEmail } from "../services/google-sheets";

const router: IRouter = Router();

router.get("/reconciliation/info", (_req, res) => {
  res.json({ serviceAccountEmail: getServiceAccountEmail() });
});

const exportSchema = z.object({
  spreadsheetId: z.string().min(1),
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
});

router.post("/reconciliation/export", async (req, res) => {
  const parsed = exportSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Parameter tidak valid", detail: parsed.error.issues });
    return;
  }
  const { spreadsheetId: rawId, year, month } = parsed.data;
  const spreadsheetId = extractSheetId(rawId);

  const periodStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const periodEnd = `${year}-${String(month).padStart(2, "0")}-${lastDay}`;

  const invoices = await db
    .select({
      invoiceNumber: tenantInvoicesTable.invoiceNumber,
      tenantName: tenantsTable.businessName,
      ownerName: tenantsTable.ownerName,
      unitCode: tenantInvoicesTable.unitCode,
      periodStart: tenantInvoicesTable.periodStart,
      periodEnd: tenantInvoicesTable.periodEnd,
      dueDate: tenantInvoicesTable.dueDate,
      rentAmount: tenantInvoicesTable.rentAmount,
      serviceChargeAmount: tenantInvoicesTable.serviceChargeAmount,
      electricityChargeAmount: tenantInvoicesTable.electricityChargeAmount,
      waterChargeAmount: tenantInvoicesTable.waterChargeAmount,
      otherChargeAmount: tenantInvoicesTable.otherChargeAmount,
      discountAmount: tenantInvoicesTable.discountAmount,
      penaltyAmount: tenantInvoicesTable.penaltyAmount,
      totalAmount: tenantInvoicesTable.totalAmount,
      paidAmount: tenantInvoicesTable.paidAmount,
      outstandingAmount: tenantInvoicesTable.outstandingAmount,
      status: tenantInvoicesTable.status,
      notes: tenantInvoicesTable.notes,
      siteId: tenantInvoicesTable.siteId,
    })
    .from(tenantInvoicesTable)
    .leftJoin(tenantsTable, eq(tenantInvoicesTable.tenantId, tenantsTable.id))
    .where(
      and(
        req.siteId ? eq(tenantInvoicesTable.siteId, req.siteId) : sql`1=1`,
        gte(tenantInvoicesTable.periodStart, periodStart),
        lte(tenantInvoicesTable.periodStart, periodEnd),
      ),
    )
    .orderBy(tenantsTable.businessName);

  const MONTH_ID = ["", "Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
  const sheetTitle = `Rekonsiliasi ${MONTH_ID[month]} ${year}`;

  const statusLabel: Record<string, string> = {
    paid: "Lunas",
    partial: "Sebagian",
    unpaid: "Belum Bayar",
    overdue: "Jatuh Tempo",
    cancelled: "Dibatalkan",
  };

  const headers = [
    "No", "No. Invoice", "Nama Tenant", "Pemilik", "Unit",
    "Periode Mulai", "Periode Selesai", "Jatuh Tempo",
    "Sewa (Rp)", "Service Charge (Rp)", "Listrik (Rp)", "Air (Rp)", "Lainnya (Rp)",
    "Diskon (Rp)", "Denda (Rp)", "Total Tagihan (Rp)",
    "Sudah Dibayar (Rp)", "Sisa (Rp)", "Status",
    "Verifikasi Bank ✓", "Catatan Rekonsiliasi", "Catatan Invoice",
  ];

  const rows = invoices.map((inv, i) => [
    i + 1,
    inv.invoiceNumber ?? "",
    inv.tenantName ?? "",
    inv.ownerName ?? "",
    inv.unitCode ?? "",
    inv.periodStart ?? "",
    inv.periodEnd ?? "",
    inv.dueDate ?? "",
    Number(inv.rentAmount ?? 0),
    Number(inv.serviceChargeAmount ?? 0),
    Number(inv.electricityChargeAmount ?? 0),
    Number(inv.waterChargeAmount ?? 0),
    Number(inv.otherChargeAmount ?? 0),
    Number(inv.discountAmount ?? 0),
    Number(inv.penaltyAmount ?? 0),
    Number(inv.totalAmount ?? 0),
    Number(inv.paidAmount ?? 0),
    Number(inv.outstandingAmount ?? 0),
    statusLabel[inv.status ?? ""] ?? inv.status ?? "",
    "",
    "",
    inv.notes ?? "",
  ]);

  try {
    await writeToSheet({ spreadsheetId, sheetTitle, headers, rows });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: "Gagal menulis ke Google Sheets", detail: msg });
    return;
  }

  res.json({
    success: true,
    sheetTitle,
    rowCount: rows.length,
    sheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
  });
});

const importSchema = z.object({
  spreadsheetId: z.string().min(1),
  sheetTitle: z.string().min(1),
});

router.post("/reconciliation/read", async (req, res) => {
  const parsed = importSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Parameter tidak valid" });
    return;
  }
  const spreadsheetId = extractSheetId(parsed.data.spreadsheetId);
  try {
    const rows = await readFromSheet({
      spreadsheetId,
      range: `'${parsed.data.sheetTitle}'`,
    });
    res.json({ rows });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: "Gagal membaca Google Sheets", detail: msg });
  }
});

export default router;
