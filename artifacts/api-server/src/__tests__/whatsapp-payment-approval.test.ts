import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@workspace/db";
import {
  tenantBookingsTable,
  tenantInvoicesTable,
  tenantPaymentsTable,
  tenantReceiptsTable,
} from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import {
  cleanupAll,
  createTestBooking,
  createTestInvoice,
  createTestPayment,
  createTestTenant,
} from "./helpers/factory";

vi.mock("../lib/accounting-entry", () => ({
  postTenantPaymentAccountingEntry: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/payment-events", () => ({
  writePaymentEvent: vi.fn().mockResolvedValue(undefined),
  normalizePaymentMethod: (method: string) => method,
}));

vi.mock("../lib/whatsapp", () => ({
  sendPaymentApproved: vi.fn().mockResolvedValue({ ok: true, skipped: true }),
  sendPaymentRejected: vi.fn().mockResolvedValue({ ok: true, skipped: true }),
  notifyAdminGroup: vi.fn().mockResolvedValue({ ok: true, skipped: true }),
}));

import { handleApprove } from "../routes/whatsapp-webhook";

const touchedPaymentIds = new Set<number>();

afterEach(async () => {
  for (const paymentId of touchedPaymentIds) {
    await db
      .delete(tenantReceiptsTable)
      .where(eq(tenantReceiptsTable.paymentId, paymentId))
      .catch(() => {});
  }
  touchedPaymentIds.clear();
  await cleanupAll();
});

describe("WhatsApp payment approval uses canonical ledger", () => {
  it("menyinkronkan payment, invoice, dan booking seperti approval panel admin", async () => {
    const tenant = await createTestTenant({ phone: "6281200000999" });
    const booking = await createTestBooking(tenant.id, {
      totalAmount: "5000000",
      paidAmount: "0",
      remainingAmount: "5000000",
      paymentStatus: "UNPAID",
    });
    const invoice = await createTestInvoice(tenant.id, booking.id, {
      totalAmount: "5000000",
      paidAmount: "0",
      outstandingAmount: "5000000",
      status: "unpaid",
    });
    await createTestInvoice(tenant.id, booking.id, {
      totalAmount: "5000000",
      paidAmount: "0",
      outstandingAmount: "5000000",
      status: "unpaid",
    });
    const payment = await createTestPayment(tenant.id, booking.id, {
      invoiceId: invoice.id,
      amount: "2000000",
      method: "transfer",
      paymentMethod: "transfer",
      approvalStatus: "pending_review",
      status: "PENDING",
      paymentStatus: "PENDING",
      paidAt: null,
      sourceType: "ocr",
    });
    touchedPaymentIds.add(payment.id);

    await handleApprove(payment.id, "6281111111111");

    const [updatedPayment] = await db
      .select()
      .from(tenantPaymentsTable)
      .where(eq(tenantPaymentsTable.id, payment.id));
    const [updatedInvoice] = await db
      .select()
      .from(tenantInvoicesTable)
      .where(eq(tenantInvoicesTable.id, invoice.id));
    const [updatedBooking] = await db
      .select()
      .from(tenantBookingsTable)
      .where(eq(tenantBookingsTable.id, booking.id));
    const [receipt] = await db
      .select()
      .from(tenantReceiptsTable)
      .where(eq(tenantReceiptsTable.paymentId, payment.id));

    expect(updatedPayment.approvalStatus).toBe("approved");
    expect(updatedPayment.approvedBy).toBe("WA:6281111111111");
    expect(updatedPayment.paymentStatus).toBe("PAID");

    expect(Number(updatedInvoice.paidAmount)).toBe(2_000_000);
    expect(Number(updatedInvoice.outstandingAmount)).toBe(3_000_000);
    expect(updatedInvoice.status).toBe("partial");

    expect(Number(updatedBooking.totalAmount)).toBe(10_000_000);
    expect(Number(updatedBooking.paidAmount)).toBe(2_000_000);
    expect(Number(updatedBooking.remainingAmount)).toBe(8_000_000);
    expect(updatedBooking.paymentStatus).toBe("PARTIAL");

    expect(receipt?.paymentId).toBe(payment.id);
  });
});
