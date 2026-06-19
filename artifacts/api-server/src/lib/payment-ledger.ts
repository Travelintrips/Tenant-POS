import { db } from "@workspace/db";
import { tenantPaymentsTable, tenantInvoicesTable } from "@workspace/db/schema";
import { eq, and, sql } from "drizzle-orm";

export class LedgerError extends Error {
  code: "OVERPAYMENT" | "DUPLICATE";
  constructor(code: "OVERPAYMENT" | "DUPLICATE", message: string) {
    super(message);
    this.code = code;
    this.name = "LedgerError";
  }
}

type AnyDb = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

/**
 * Recalculate invoice paid_amount from ALL non-voided approved payments.
 * Idempotent — safe to call multiple times; always converges to correct state.
 */
export async function syncInvoiceFromPayments(
  tx: AnyDb,
  invoiceId: number,
  now = new Date(),
): Promise<{ paidAmount: number; outstanding: number; status: string }> {
  const [sumRow] = await tx
    .select({ sumPaid: sql<string>`coalesce(sum(amount::numeric), 0)::text` })
    .from(tenantPaymentsTable)
    .where(
      and(
        eq(tenantPaymentsTable.invoiceId, invoiceId),
        eq(tenantPaymentsTable.isVoided, false),
        eq(tenantPaymentsTable.approvalStatus, "approved"),
      ),
    );

  const [invoice] = await tx
    .select({
      totalAmount: tenantInvoicesTable.totalAmount,
      dueDate: tenantInvoicesTable.dueDate,
    })
    .from(tenantInvoicesTable)
    .where(eq(tenantInvoicesTable.id, invoiceId));

  if (!invoice) throw new Error("Invoice tidak ditemukan");

  const paidAmount = parseFloat(sumRow?.sumPaid ?? "0");
  const total = Number(invoice.totalAmount);
  const outstanding = Math.max(total - paidAmount, 0);

  let status: string;
  if (paidAmount >= total) {
    status = "paid";
  } else if (paidAmount > 0) {
    status = "partial";
  } else if (invoice.dueDate && new Date(invoice.dueDate) < now) {
    status = "overdue";
  } else {
    status = "unpaid";
  }

  await tx
    .update(tenantInvoicesTable)
    .set({
      paidAmount: String(paidAmount),
      outstandingAmount: String(outstanding),
      status,
      updatedAt: now,
    })
    .where(eq(tenantInvoicesTable.id, invoiceId));

  return { paidAmount, outstanding, status };
}

/**
 * Check if a referenceId has already been recorded.
 * Returns the existing paymentId, or null if not found (idempotency guard).
 */
export async function findDuplicatePayment(referenceId: string): Promise<number | null> {
  const [existing] = await db
    .select({ id: tenantPaymentsTable.id })
    .from(tenantPaymentsTable)
    .where(eq(tenantPaymentsTable.referenceId, referenceId))
    .limit(1);
  return existing?.id ?? null;
}

/**
 * Validate that adding `newAmount` to invoice won't create an overpayment.
 * Throws LedgerError("OVERPAYMENT") if it would exceed total (±0.1% tolerance).
 */
export async function validateNoOverpayment(
  tx: AnyDb,
  invoiceId: number,
  newAmount: number,
): Promise<void> {
  const [[sumRow], [invoice]] = await Promise.all([
    tx
      .select({ sumPaid: sql<string>`coalesce(sum(amount::numeric), 0)::text` })
      .from(tenantPaymentsTable)
      .where(
        and(
          eq(tenantPaymentsTable.invoiceId, invoiceId),
          eq(tenantPaymentsTable.isVoided, false),
          eq(tenantPaymentsTable.approvalStatus, "approved"),
        ),
      ),
    tx
      .select({ totalAmount: tenantInvoicesTable.totalAmount })
      .from(tenantInvoicesTable)
      .where(eq(tenantInvoicesTable.id, invoiceId)),
  ]);

  if (!invoice) throw new Error("Invoice tidak ditemukan");

  const existingPaid = parseFloat(sumRow?.sumPaid ?? "0");
  const total = Number(invoice.totalAmount);

  if (existingPaid + newAmount > total * 1.001) {
    const remaining = Math.max(total - existingPaid, 0);
    throw new LedgerError(
      "OVERPAYMENT",
      `Pembayaran melebihi total invoice. Sisa outstanding: Rp ${remaining.toLocaleString("id-ID")}`,
    );
  }
}
