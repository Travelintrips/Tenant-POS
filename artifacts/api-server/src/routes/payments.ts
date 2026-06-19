import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { tenantPaymentsTable, tenantInvoicesTable, tenantsTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { logAudit } from "../lib/audit";
import { LedgerError, findDuplicatePayment, validateNoOverpayment, syncInvoiceFromPayments } from "../lib/payment-ledger";

const router: IRouter = Router();

const createPaymentSchema = z.object({
  invoiceId: z.number().int().positive(),
  amount: z.number().positive("Jumlah harus lebih dari 0"),
  paymentMethod: z.enum(["tunai", "transfer", "qris", "edc", "other"]).default("tunai"),
  referenceId: z.string().min(1).optional(),
  sourceType: z.enum(["pos", "bank_recon", "manual", "upload"]).default("manual"),
  referenceNumber: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  shiftId: z.number().int().positive().optional().nullable(),
  paidAt: z.string().datetime().optional().nullable(),
});

// ─── POST /api/payments ────────────────────────────────────────────────────────
// Endpoint terpadu untuk mencatat pembayaran invoice. Mendukung idempotency via
// referenceId dan validasi anti-overpayment.
router.post("/payments", async (req, res) => {
  const parsed = createPaymentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Data tidak valid", detail: parsed.error.issues });
    return;
  }

  const {
    invoiceId, amount, paymentMethod, referenceId, sourceType,
    referenceNumber, notes, shiftId, paidAt,
  } = parsed.data;

  // Idempotency check
  if (referenceId) {
    const existingId = await findDuplicatePayment(referenceId);
    if (existingId != null) {
      res.status(409).json({
        error: "Pembayaran duplikat. referenceId sudah pernah diproses.",
        paymentId: existingId,
        referenceId,
      });
      return;
    }
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [invoice] = await tx
        .select({
          id: tenantInvoicesTable.id,
          invoiceNumber: tenantInvoicesTable.invoiceNumber,
          tenantId: tenantInvoicesTable.tenantId,
          bookingId: tenantInvoicesTable.bookingId,
          siteId: tenantInvoicesTable.siteId,
          status: tenantInvoicesTable.status,
          totalAmount: tenantInvoicesTable.totalAmount,
        })
        .from(tenantInvoicesTable)
        .where(eq(tenantInvoicesTable.id, invoiceId))
        .for("update");

      if (!invoice) {
        throw Object.assign(new Error("Invoice tidak ditemukan"), { status: 404 });
      }
      if (invoice.status === "cancelled") {
        throw Object.assign(new Error("Invoice telah dibatalkan"), { status: 409 });
      }
      if (invoice.status === "paid") {
        throw Object.assign(new Error("Invoice sudah lunas"), { status: 409 });
      }

      await validateNoOverpayment(tx, invoiceId, amount);

      const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const prefix = `PAY-${datePart}-`;
      const [countRow] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(tenantPaymentsTable)
        .where(sql`receipt_number LIKE ${prefix + "%"}`);
      const seq = ((countRow?.count ?? 0) + 1).toString().padStart(4, "0");
      const receiptNumber = `${prefix}${seq}`;

      const [payment] = await tx
        .insert(tenantPaymentsTable)
        .values({
          invoiceId,
          tenantId: invoice.tenantId ?? undefined,
          bookingId: invoice.bookingId ?? undefined,
          tenantBookingId: invoice.bookingId ?? undefined,
          siteId: invoice.siteId ?? undefined,
          amount: String(amount),
          discountAmount: "0",
          penaltyAmount: "0",
          paymentMethod,
          method: paymentMethod,
          paymentStatus: "PAID",
          status: "PAID",
          approvalStatus: "approved",
          receiptNumber,
          referenceNumber: referenceNumber ?? null,
          referenceId: referenceId ?? null,
          sourceType,
          shiftId: shiftId ?? null,
          notes: notes ?? null,
          paidAt: paidAt ? new Date(paidAt) : new Date(),
          isVoided: false,
          refundAmount: "0",
        })
        .returning();

      const ledger = await syncInvoiceFromPayments(tx, invoiceId);

      return { payment, invoiceStatus: ledger.status, paidAmount: ledger.paidAmount, outstanding: ledger.outstanding };
    });

    logAudit(req, {
      action: "create_payment",
      entityType: "tenant_payments",
      entityId: result.payment.id,
      afterData: {
        paymentId: result.payment.id,
        invoiceId,
        amount,
        paymentMethod,
        sourceType,
        referenceId: referenceId ?? null,
        invoiceStatus: result.invoiceStatus,
      },
    });

    res.status(201).json({
      success: true,
      payment: result.payment,
      invoice: {
        id: invoiceId,
        status: result.invoiceStatus,
        paidAmount: result.paidAmount,
        outstanding: result.outstanding,
      },
    });
  } catch (err) {
    if (err instanceof LedgerError) {
      const httpCode = err.code === "OVERPAYMENT" ? 400 : 409;
      res.status(httpCode).json({ error: err.message, code: err.code });
      return;
    }
    const e = err as Error & { status?: number };
    if (e.status) {
      res.status(e.status).json({ error: e.message });
      return;
    }
    console.error("[POST /payments]", err);
    res.status(500).json({ error: "Gagal mencatat pembayaran" });
  }
});

// ─── GET /api/payments/:id ─────────────────────────────────────────────────────
router.get("/payments/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid" }); return; }

  try {
    const [payment] = await db
      .select({
        id: tenantPaymentsTable.id,
        invoiceId: tenantPaymentsTable.invoiceId,
        tenantId: tenantPaymentsTable.tenantId,
        amount: tenantPaymentsTable.amount,
        paymentMethod: tenantPaymentsTable.paymentMethod,
        paymentStatus: tenantPaymentsTable.paymentStatus,
        approvalStatus: tenantPaymentsTable.approvalStatus,
        receiptNumber: tenantPaymentsTable.receiptNumber,
        referenceId: tenantPaymentsTable.referenceId,
        referenceNumber: tenantPaymentsTable.referenceNumber,
        sourceType: tenantPaymentsTable.sourceType,
        notes: tenantPaymentsTable.notes,
        paidAt: tenantPaymentsTable.paidAt,
        isVoided: tenantPaymentsTable.isVoided,
        createdAt: tenantPaymentsTable.createdAt,
        businessName: tenantsTable.businessName,
        ownerName: tenantsTable.ownerName,
      })
      .from(tenantPaymentsTable)
      .leftJoin(tenantsTable, eq(tenantPaymentsTable.tenantId, tenantsTable.id))
      .where(eq(tenantPaymentsTable.id, id));

    if (!payment) {
      res.status(404).json({ error: "Pembayaran tidak ditemukan" });
      return;
    }

    res.json(payment);
  } catch (err) {
    console.error("[GET /payments/:id]", err);
    res.status(500).json({ error: "Gagal mengambil data pembayaran" });
  }
});

export default router;
