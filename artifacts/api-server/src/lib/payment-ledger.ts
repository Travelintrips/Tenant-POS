import { db } from "@workspace/db";
import { tenantPaymentsTable, tenantInvoicesTable } from "@workspace/db/schema";
import { eq, and, sql } from "drizzle-orm";

// ── Error types ───────────────────────────────────────────────────────────────

export class LedgerError extends Error {
  code: "OVERPAYMENT" | "DUPLICATE";
  constructor(code: "OVERPAYMENT" | "DUPLICATE", message: string) {
    super(message);
    this.code = code;
    this.name = "LedgerError";
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

type AnyDb = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

export interface RecordPaymentParams {
  invoiceId: number;
  amount: number;
  paymentMethod: string;
  sourceType: "pos" | "ocr" | "bank" | "manual";
  receiptNumber: string;
  referenceId?: string | null;
  referenceNumber?: string | null;
  notes?: string | null;
  shiftId?: number | null;
  paidAt?: Date | null;
  siteId?: number | null;
  tenantId?: number | null;
  bookingId?: number | null;
  discountAmount?: number;
  penaltyAmount?: number;
  proofUrl?: string | null;
}

export interface LedgerResult {
  ledgerEntryId: number;
  invoiceStatus: string;
  paidAmount: number;
  remaining: number;
  receiptNumber: string;
  remainingBalanceAfter: number;
}

// ── Core: sync invoice from all approved payments (idempotent) ────────────────

/**
 * Recalculate invoice paid_amount from ALL non-voided approved payments.
 * Always call this after any payment status change; never manually update paid_amount.
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
    .set({ paidAmount: String(paidAmount), outstandingAmount: String(outstanding), status, updatedAt: now })
    .where(eq(tenantInvoicesTable.id, invoiceId));

  return { paidAmount, outstanding, status };
}

// ── Validation helpers ────────────────────────────────────────────────────────

/**
 * Check whether referenceId already exists in the ledger.
 * Returns paymentId of the existing record, or null if no duplicate.
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
 * Validate that adding `newAmount` to the invoice will not exceed its total.
 * Tolerance: 0.1% for rounding differences.
 * Throws LedgerError("OVERPAYMENT") on failure.
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

// ── Central orchestration ─────────────────────────────────────────────────────

/**
 * Record a new payment against an invoice (insert + validate + sync).
 * This is the single authoritative path for all new payment records.
 *
 * Validates:
 *   - Duplicate referenceId → LedgerError("DUPLICATE")
 *   - Overpayment → LedgerError("OVERPAYMENT")
 *
 * Then:
 *   - Inserts the payment record with approved status
 *   - Syncs invoice paid_amount/status via syncInvoiceFromPayments
 *
 * Returns standardized LedgerResult.
 */
export async function recordPayment(
  tx: AnyDb,
  params: RecordPaymentParams,
  now = new Date(),
): Promise<LedgerResult> {
  // 1. Idempotency check (inside tx so we hold a consistent snapshot)
  if (params.referenceId) {
    const [dup] = await tx
      .select({ id: tenantPaymentsTable.id })
      .from(tenantPaymentsTable)
      .where(eq(tenantPaymentsTable.referenceId, params.referenceId))
      .limit(1);
    if (dup) {
      throw new LedgerError(
        "DUPLICATE",
        `Pembayaran duplikat: referenceId '${params.referenceId}' sudah pernah diproses`,
      );
    }
  }

  // 2. Overpayment guard
  await validateNoOverpayment(tx, params.invoiceId, params.amount);

  // 3. Insert payment record (without remaining_balance_after first)
  const [payment] = await tx
    .insert(tenantPaymentsTable)
    .values({
      invoiceId: params.invoiceId,
      tenantId: params.tenantId ?? undefined,
      bookingId: params.bookingId ?? undefined,
      tenantBookingId: params.bookingId ?? undefined,
      siteId: params.siteId ?? undefined,
      amount: String(params.amount),
      discountAmount: String(params.discountAmount ?? 0),
      penaltyAmount: String(params.penaltyAmount ?? 0),
      paymentMethod: params.paymentMethod,
      method: params.paymentMethod,
      paymentStatus: "PAID",
      status: "PAID",
      approvalStatus: "approved",
      receiptNumber: params.receiptNumber,
      referenceId: params.referenceId ?? null,
      referenceNumber: params.referenceNumber ?? null,
      sourceType: params.sourceType,
      shiftId: params.shiftId ?? null,
      notes: params.notes ?? null,
      paidAt: params.paidAt ?? now,
      proofUrl: params.proofUrl ?? null,
      proofImageUrl: params.proofUrl ?? null,
      isVoided: false,
      refundAmount: "0",
    })
    .returning();

  // 4. Sync invoice balances
  const ledger = await syncInvoiceFromPayments(tx, params.invoiceId, now);

  // 5. Backfill remaining_balance_after on the new payment row
  await tx
    .update(tenantPaymentsTable)
    .set({ remainingBalanceAfter: String(ledger.outstanding) })
    .where(eq(tenantPaymentsTable.id, payment.id));

  return {
    ledgerEntryId: payment.id,
    invoiceStatus: ledger.status,
    paidAmount: ledger.paidAmount,
    remaining: ledger.outstanding,
    remainingBalanceAfter: ledger.outstanding,
    receiptNumber: params.receiptNumber,
  };
}

/**
 * Approve an existing pending_review payment and sync the invoice.
 * Used by the OCR proof approval flow (payment already exists, just flip status).
 *
 * Validates overpayment before flipping.
 * Returns updated invoice summary.
 */
export async function approveExistingPayment(
  tx: AnyDb,
  paymentId: number,
  invoiceId: number,
  approvedBy: string,
  now = new Date(),
): Promise<{ invoiceStatus: string; paidAmount: number; remaining: number }> {
  // Get payment amount for overpayment check
  const [payment] = await tx
    .select({ amount: tenantPaymentsTable.amount })
    .from(tenantPaymentsTable)
    .where(eq(tenantPaymentsTable.id, paymentId));

  if (!payment) throw new Error("Pembayaran tidak ditemukan");

  // Overpayment check (payment is still pending_review, so not counted in existing sum)
  await validateNoOverpayment(tx, invoiceId, parseFloat(String(payment.amount)));

  // Flip to approved
  await tx
    .update(tenantPaymentsTable)
    .set({
      approvalStatus: "approved",
      approvedBy,
      approvedAt: now,
      paidAt: now,
      paymentStatus: "PAID",
      status: "PAID",
      sourceType: "ocr",
      updatedAt: now,
    })
    .where(eq(tenantPaymentsTable.id, paymentId));

  // Sync invoice
  const ledger = await syncInvoiceFromPayments(tx, invoiceId, now);

  // Backfill remaining_balance_after after sync
  await tx
    .update(tenantPaymentsTable)
    .set({ remainingBalanceAfter: String(ledger.outstanding) })
    .where(eq(tenantPaymentsTable.id, paymentId));

  return {
    invoiceStatus: ledger.status,
    paidAmount: ledger.paidAmount,
    remaining: ledger.outstanding,
  };
}
