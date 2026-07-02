/**
 * auto-invoice.ts
 * Buat invoice otomatis untuk seluruh periode sewa saat booking dibuat dari persetujuan draf.
 */
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

function calcAmounts(opts: {
  rentAmount: number;
  serviceChargeAmount: number;
  electricityChargeAmount: number;
  waterChargeAmount: number;
  otherChargeAmount: number;
  trashChargeAmount: number;
}) {
  const total =
    opts.rentAmount +
    opts.serviceChargeAmount +
    opts.electricityChargeAmount +
    opts.waterChargeAmount +
    opts.otherChargeAmount +
    opts.trashChargeAmount;
  return {
    subtotal: String(total),
    taxAmount: "0",
    totalAmount: String(total),
    outstandingAmount: String(total),
  };
}

/**
 * Mengambil inisial nama perusahaan dari format "PT NAMA PERUSAHAAN".
 * Contoh: "PT ELMIRA RATU ABADI" → "ERA"
 */
function getCompanyInitials(companyName: string): string {
  const cleaned = companyName.trim().toUpperCase().replace(/^PT\.?\s+/i, "");
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "INV";
  return words.map((w) => w[0]).join("");
}

async function getSitePrefix(siteId: number): Promise<string> {
  try {
    const result = await db.execute(sql`
      SELECT company_name, invoice_prefix FROM mall_sites WHERE id = ${siteId} LIMIT 1
    `);
    const rows = (result as unknown as { rows: { company_name: string | null; invoice_prefix: string | null }[] }).rows;
    const site = rows[0];
    if (site?.company_name) return getCompanyInitials(site.company_name);
    if (site?.invoice_prefix) return site.invoice_prefix;
  } catch {
    // fallback
  }
  return "INV";
}

async function generateInvoiceNumber(siteId: number): Promise<string> {
  const now = new Date();
  const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const initials = await getSitePrefix(siteId);
  const prefix = `${initials}/${yyyymm}/`;

  const result = await db.execute(sql`
    SELECT CAST(SUBSTR(invoice_number, ${prefix.length + 1}) AS INTEGER) AS seq
    FROM tenant_invoices
    WHERE invoice_number LIKE ${prefix + "%"}
      AND LENGTH(invoice_number) = ${prefix.length + 5}
    ORDER BY seq DESC
    LIMIT 1
  `);
  const rows = (result as unknown as { rows: { seq: number | null }[] }).rows;
  const lastSeq = rows[0]?.seq ?? 0;
  const nextSeq = String((lastSeq || 0) + 1).padStart(5, "0");
  return `${prefix}${nextSeq}`;
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Tambah N bulan ke tanggal base, MEMPERTAHANKAN hari asli.
 * Contoh: base=15 Juli + 1 bulan → 15 Agustus.
 * Jika hari melebihi akhir bulan tujuan (misal 31 Jan + 1 bln), pakai hari terakhir bulan itu.
 */
function addMonths(base: Date, months: number): Date {
  const targetMonth = base.getMonth() + months;
  const year = base.getFullYear() + Math.floor(targetMonth / 12);
  const month = ((targetMonth % 12) + 12) % 12;
  const day = base.getDate();
  // Clamp ke hari terakhir bulan jika perlu
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day, lastDay));
}

/**
 * Akhir periode = 1 hari sebelum periode berikutnya dimulai.
 * Contoh: start=15 Juli → end=14 Agustus.
 */
function calcPeriodEnd(periodStart: Date): Date {
  const nextStart = addMonths(periodStart, 1);
  return new Date(nextStart.getFullYear(), nextStart.getMonth(), nextStart.getDate() - 1);
}

async function insertOneInvoice(opts: {
  siteId: number;
  tenantId: number;
  bookingId: number;
  unitCode: string | null;
  rentAmount: number;
  serviceChargeAmount: number;
  electricityChargeAmount: number;
  waterChargeAmount: number;
  otherChargeAmount: number;
  trashChargeAmount: number;
  periodStartStr: string;
  periodEndStr: string;
  dueDateStr: string;
  now: Date;
}): Promise<number | null> {
  const {
    siteId, tenantId, bookingId, unitCode,
    rentAmount, serviceChargeAmount, electricityChargeAmount,
    waterChargeAmount, otherChargeAmount, trashChargeAmount,
    periodStartStr, periodEndStr, dueDateStr, now,
  } = opts;
  const { subtotal, taxAmount, totalAmount, outstandingAmount } = calcAmounts({
    rentAmount, serviceChargeAmount, electricityChargeAmount,
    waterChargeAmount, otherChargeAmount, trashChargeAmount,
  });
  const status = new Date(dueDateStr) < now ? "overdue" : "unpaid";

  for (let attempt = 0; attempt < 3; attempt++) {
    const invoiceNumber = await generateInvoiceNumber(siteId);
    try {
      const insertResult = await db.execute(sql`
        INSERT INTO tenant_invoices (
          site_id, tenant_id, booking_id, unit_code,
          invoice_number, period_start, period_end, due_date,
          rent_amount, service_charge_amount, electricity_charge_amount, water_charge_amount,
          other_charge_amount, trash_charge_amount, discount_amount, penalty_amount,
          tax_amount, subtotal, total_amount,
          paid_amount, outstanding_amount, status
        ) VALUES (
          ${siteId}, ${tenantId}, ${bookingId}, ${unitCode},
          ${invoiceNumber}, ${periodStartStr}, ${periodEndStr}, ${dueDateStr},
          ${String(rentAmount)}, ${String(serviceChargeAmount)}, ${String(electricityChargeAmount)}, ${String(waterChargeAmount)},
          ${String(otherChargeAmount)}, ${String(trashChargeAmount)}, '0', '0',
          ${taxAmount}, ${subtotal}, ${totalAmount},
          '0', ${outstandingAmount}, ${status}
        )
        RETURNING id
      `);
      const id = (insertResult as unknown as { rows: { id: number }[] }).rows[0]?.id ?? null;
      logger.info(
        `[auto-invoice] Invoice ${invoiceNumber} (${periodStartStr}) dibuat (bookingId=${bookingId}, total=${totalAmount})`,
      );
      return id;
    } catch (err: unknown) {
      const code = (err as { cause?: { code?: string } })?.cause?.code;
      if (code === "23505" && attempt < 2) continue;
      throw err;
    }
  }
  return null;
}

/**
 * Buat invoice untuk SELURUH periode sewa (1 invoice per bulan).
 * Idempoten: bulan yang sudah ada invoice-nya dilewati.
 *
 * Biaya tambahan (service charge, listrik, air, dll) diambil dari:
 * 1. Nilai eksplisit yang di-pass (jika ada)
 * 2. Default biaya dari record tenant di DB
 * 3. 0 jika tidak ada data
 *
 * @returns array of created invoice IDs
 */
export async function createAllInvoicesForBooking(opts: {
  bookingId: number;
  siteId: number;
  tenantId: number;
  unitCode: string | null;
  rentAmount: number;
  startDate: string;      // "YYYY-MM-DD" — awal periode sewa
  durationMonths: number; // jumlah bulan
  serviceChargeAmount?: number;
  electricityChargeAmount?: number;
  waterChargeAmount?: number;
  otherChargeAmount?: number;
  trashChargeAmount?: number;
}): Promise<number[]> {
  const { bookingId, siteId, tenantId, unitCode, rentAmount, startDate, durationMonths } = opts;

  if (durationMonths <= 0 || rentAmount <= 0) return [];

  // Ambil default biaya dari tenant jika tidak di-pass secara eksplisit
  let serviceChargeAmount = opts.serviceChargeAmount ?? 0;
  let electricityChargeAmount = opts.electricityChargeAmount ?? 0;
  let waterChargeAmount = opts.waterChargeAmount ?? 0;
  let otherChargeAmount = opts.otherChargeAmount ?? 0;
  let trashChargeAmount = opts.trashChargeAmount ?? 0;

  const hasMissingCharges =
    opts.serviceChargeAmount === undefined ||
    opts.electricityChargeAmount === undefined ||
    opts.waterChargeAmount === undefined;

  if (hasMissingCharges) {
    try {
      const tenantResult = await db.execute(sql`
        SELECT
          default_service_charge_amount,
          default_electricity_charge_amount,
          default_water_charge_amount,
          default_other_charge_amount,
          default_trash_charge_amount
        FROM tenants WHERE id = ${tenantId} LIMIT 1
      `);
      const t = (tenantResult as unknown as { rows: Record<string, string | null>[] }).rows[0];
      if (t) {
        if (opts.serviceChargeAmount === undefined) serviceChargeAmount = Number(t["default_service_charge_amount"] ?? 0);
        if (opts.electricityChargeAmount === undefined) electricityChargeAmount = Number(t["default_electricity_charge_amount"] ?? 0);
        if (opts.waterChargeAmount === undefined) waterChargeAmount = Number(t["default_water_charge_amount"] ?? 0);
        if (opts.otherChargeAmount === undefined) otherChargeAmount = Number(t["default_other_charge_amount"] ?? 0);
        if (opts.trashChargeAmount === undefined) trashChargeAmount = Number(t["default_trash_charge_amount"] ?? 0);
      }
    } catch (err) {
      logger.warn({ err, tenantId }, "[auto-invoice] Gagal ambil default biaya tenant, pakai 0");
    }
  }

  const baseDate = new Date(startDate + "T00:00:00Z");
  const now = new Date();
  const createdIds: number[] = [];

  // Ambil bulan yang sudah ada invoice untuk booking ini (idempotency)
  const existingResult = await db.execute(
    sql`SELECT period_start FROM tenant_invoices WHERE booking_id = ${bookingId}`
  );
  const existingMonths = new Set(
    (existingResult as unknown as { rows: { period_start: string }[] }).rows.map((r) => r.period_start.slice(0, 10))
  );

  for (let i = 0; i < durationMonths; i++) {
    const monthStart = addMonths(baseDate, i);
    const monthEnd = calcPeriodEnd(monthStart);
    // Jatuh tempo = tanggal terbit + 5 hari
    const dueDate = new Date(monthStart.getTime() + 5 * 24 * 60 * 60 * 1000);

    const periodStartStr = toDateStr(monthStart);
    const periodEndStr = toDateStr(monthEnd);
    const dueDateStr = toDateStr(dueDate);
    // Key idempoten: YYYY-MM-DD (tanggal persis, bukan hanya bulan)
    // agar tenant tanggal 1 dan 15 bisa koeksis di bulan yang sama jika perlu
    const monthKey = periodStartStr;

    if (existingMonths.has(monthKey)) {
      logger.debug(`[auto-invoice] Invoice ${monthKey} sudah ada, dilewati (bookingId=${bookingId})`);
      continue;
    }

    const id = await insertOneInvoice({
      siteId, tenantId, bookingId, unitCode,
      rentAmount,
      serviceChargeAmount,
      electricityChargeAmount,
      waterChargeAmount,
      otherChargeAmount,
      trashChargeAmount,
      periodStartStr, periodEndStr, dueDateStr, now,
    });
    if (id) {
      createdIds.push(id);
      existingMonths.add(monthKey);
    }
  }

  logger.info(`[auto-invoice] Selesai: ${createdIds.length} invoice dibuat untuk bookingId=${bookingId} (${durationMonths} bulan)`);
  return createdIds;
}

/**
 * @deprecated Gunakan createAllInvoicesForBooking.
 * Tetap tersedia untuk backward-compat.
 */
export async function createInitialInvoiceForBooking(opts: {
  bookingId: number;
  siteId: number;
  tenantId: number;
  unitCode: string | null;
  rentAmount: number;
  startDate?: string;
  durationMonths?: number;
  billingCycle?: string;
}): Promise<number | null> {
  const ids = await createAllInvoicesForBooking({
    bookingId: opts.bookingId,
    siteId: opts.siteId,
    tenantId: opts.tenantId,
    unitCode: opts.unitCode,
    rentAmount: opts.rentAmount,
    startDate: opts.startDate ?? new Date().toISOString().slice(0, 10),
    durationMonths: opts.durationMonths ?? 1,
  });
  return ids[0] ?? null;
}
