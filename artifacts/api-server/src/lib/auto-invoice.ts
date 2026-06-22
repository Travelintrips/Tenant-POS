/**
 * Helper: auto-buat invoice pertama setelah booking dibuat dari persetujuan draf perjanjian.
 * Dipanggil dari calon-tenant.ts dan draft-agreements-public.ts (fire-and-forget).
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
  const rows = (result as { rows: { seq: number | null }[] }).rows;
  const lastSeq = rows[0]?.seq ?? 0;
  const nextSeq = String((lastSeq || 0) + 1).padStart(4, "0");
  return `${prefix}${nextSeq}`;
}

export async function createInitialInvoiceForBooking(opts: {
  bookingId: number;
  siteId: number;
  tenantId: number;
  unitCode: string | null;
  rentAmount: number;
  billingCycle?: string;
}): Promise<number | null> {
  const { bookingId, siteId, tenantId, unitCode, rentAmount, billingCycle = "monthly" } = opts;

  const now = new Date();
  let periodStart: Date;
  let periodEnd: Date;
  let dueDate: Date;

  if (billingCycle === "quarterly") {
    const q = Math.floor(now.getMonth() / 3);
    periodStart = new Date(now.getFullYear(), q * 3, 1);
    periodEnd = new Date(now.getFullYear(), q * 3 + 3, 0);
    dueDate = new Date(periodEnd);
    dueDate.setDate(dueDate.getDate() + 5);
  } else {
    periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    dueDate = new Date(now.getFullYear(), now.getMonth() + 1, 5);
  }

  const toDate = (d: Date) => d.toISOString().slice(0, 10);
  const periodStartStr = toDate(periodStart);
  const periodEndStr = toDate(periodEnd);
  const dueDateStr = toDate(dueDate);

  // Idempotency: skip jika sudah ada invoice untuk booking + periode ini
  const existing = await db.execute(
    sql`SELECT id FROM tenant_invoices
        WHERE booking_id = ${bookingId} AND period_start = ${periodStartStr}
        LIMIT 1`
  );
  const existingRows = (existing as { rows: { id: number }[] }).rows;
  if (existingRows.length > 0) {
    return existingRows[0]?.id ?? null;
  }

  const { subtotal, taxAmount, totalAmount, outstandingAmount } = calcAmounts(rentAmount);
  const status = new Date(dueDateStr) < now ? "overdue" : "unpaid";

  // Retry jika invoice number collision (race condition)
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
      const id = (insertResult as { rows: { id: number }[] }).rows[0]?.id ?? null;
      console.log(`[auto-invoice] Invoice ${invoiceNumber} dibuat (bookingId=${bookingId})`);
      return id;
    } catch (err: unknown) {
      const code = (err as { cause?: { code?: string } })?.cause?.code;
      if (code === "23505" && attempt < 2) continue;
      throw err;
    }
  }
  return null;
}
