/**
 * auto-invoice.ts
 * Buat invoice otomatis untuk seluruh periode sewa saat booking dibuat dari persetujuan draf.
 */
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

function calcAmounts(rentAmount: number) {
  const total = rentAmount;
  return {
    subtotal: String(total),
    taxAmount: "0",
    totalAmount: String(total),
    outstandingAmount: String(total),
  };
}

async function generateInvoiceNumber(): Promise<string> {
  const now = new Date();
  const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prefix = `INV-TENANT/${yyyymm}/`;

  const result = await db.execute(sql`
    SELECT CAST(SUBSTR(invoice_number, ${prefix.length + 1}) AS INTEGER) AS seq
    FROM tenant_invoices
    WHERE invoice_number LIKE ${prefix + "%"}
    ORDER BY seq DESC
    LIMIT 1
  `);
  const rows = (result as unknown as { rows: { seq: number | null }[] }).rows;
  const lastSeq = rows[0]?.seq ?? 0;
  const nextSeq = String((lastSeq || 0) + 1).padStart(4, "0");
  return `${prefix}${nextSeq}`;
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Kembalikan tanggal awal bulan ke-N dari referensi bulan (0-indexed) */
function addMonths(base: Date, months: number): Date {
  const d = new Date(base.getFullYear(), base.getMonth() + months, 1);
  return d;
}

/** Kembalikan tanggal akhir bulan */
function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

async function insertOneInvoice(opts: {
  siteId: number;
  tenantId: number;
  bookingId: number;
  unitCode: string | null;
  rentAmount: number;
  periodStartStr: string;
  periodEndStr: string;
  dueDateStr: string;
  now: Date;
}): Promise<number | null> {
  const { siteId, tenantId, bookingId, unitCode, rentAmount, periodStartStr, periodEndStr, dueDateStr, now } = opts;
  const { subtotal, taxAmount, totalAmount, outstandingAmount } = calcAmounts(rentAmount);
  const status = new Date(dueDateStr) < now ? "overdue" : "unpaid";

  for (let attempt = 0; attempt < 3; attempt++) {
    const invoiceNumber = await generateInvoiceNumber();
    try {
      const insertResult = await db.execute(sql`
        INSERT INTO tenant_invoices (
          site_id, tenant_id, booking_id, unit_code,
          invoice_number, period_start, period_end, due_date,
          rent_amount, service_charge_amount, electricity_charge_amount, water_charge_amount,
          other_charge_amount, discount_amount, penalty_amount,
          tax_amount, subtotal, total_amount,
          paid_amount, outstanding_amount, status
        ) VALUES (
          ${siteId}, ${tenantId}, ${bookingId}, ${unitCode},
          ${invoiceNumber}, ${periodStartStr}, ${periodEndStr}, ${dueDateStr},
          ${String(rentAmount)}, '0', '0', '0',
          '0', '0', '0',
          ${taxAmount}, ${subtotal}, ${totalAmount},
          '0', ${outstandingAmount}, ${status}
        )
        RETURNING id
      `);
      const id = (insertResult as unknown as { rows: { id: number }[] }).rows[0]?.id ?? null;
      console.log(`[auto-invoice] Invoice ${invoiceNumber} (${periodStartStr}) dibuat (bookingId=${bookingId})`);
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
}): Promise<number[]> {
  const { bookingId, siteId, tenantId, unitCode, rentAmount, startDate, durationMonths } = opts;

  if (durationMonths <= 0 || rentAmount <= 0) return [];

  const baseDate = new Date(startDate + "T00:00:00Z");
  const now = new Date();
  const createdIds: number[] = [];

  // Ambil bulan yang sudah ada invoice untuk booking ini (idempotency)
  const existingResult = await db.execute(
    sql`SELECT period_start FROM tenant_invoices WHERE booking_id = ${bookingId}`
  );
  const existingMonths = new Set(
    (existingResult as unknown as { rows: { period_start: string }[] }).rows.map((r) => r.period_start.slice(0, 7))
  );

  for (let i = 0; i < durationMonths; i++) {
    const monthStart = addMonths(baseDate, i);
    const monthEnd = endOfMonth(monthStart);
    const dueDate = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 5);

    const periodStartStr = toDateStr(monthStart);
    const periodEndStr = toDateStr(monthEnd);
    const dueDateStr = toDateStr(dueDate);
    const monthKey = periodStartStr.slice(0, 7);

    if (existingMonths.has(monthKey)) {
      console.log(`[auto-invoice] Invoice ${monthKey} sudah ada, dilewati (bookingId=${bookingId})`);
      continue;
    }

    const id = await insertOneInvoice({
      siteId, tenantId, bookingId, unitCode,
      rentAmount, periodStartStr, periodEndStr, dueDateStr, now,
    });
    if (id) {
      createdIds.push(id);
      existingMonths.add(monthKey);
    }
  }

  console.log(`[auto-invoice] Selesai: ${createdIds.length} invoice dibuat untuk bookingId=${bookingId} (${durationMonths} bulan)`);
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
