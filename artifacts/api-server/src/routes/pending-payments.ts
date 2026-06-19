import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  tenantPaymentsTable,
  tenantInvoicesTable,
  tenantsTable,
} from "@workspace/db/schema";
import { eq, and, inArray, desc } from "drizzle-orm";
import { z } from "zod";
import { requireAnyRole } from "../middlewares/auth";
import { sseBroker } from "../lib/sse-broker";
import { sendPaymentApproved, sendPaymentRejected } from "../lib/whatsapp";
import { logAudit } from "../lib/audit";
import { writePaymentEvent, normalizePaymentMethod } from "../lib/payment-events";
import { approveExistingPayment, LedgerError } from "../lib/payment-ledger";

const router: IRouter = Router();

router.use(
  "/pending-payments",
  requireAnyRole("owner", "admin", "finance"),
);

const pendingPaymentSelect = {
  id: tenantPaymentsTable.id,
  receiptNumber: tenantPaymentsTable.receiptNumber,
  amount: tenantPaymentsTable.amount,
  paymentMethod: tenantPaymentsTable.paymentMethod,
  proofUrl: tenantPaymentsTable.proofUrl,
  referenceNumber: tenantPaymentsTable.referenceNumber,
  notes: tenantPaymentsTable.notes,
  createdAt: tenantPaymentsTable.createdAt,
  approvalStatus: tenantPaymentsTable.approvalStatus,
  rejectionReason: tenantPaymentsTable.rejectionReason,
  approvedBy: tenantPaymentsTable.approvedBy,
  approvedAt: tenantPaymentsTable.approvedAt,
  invoiceId: tenantPaymentsTable.invoiceId,
  tenantId: tenantPaymentsTable.tenantId,
  invoiceNumber: tenantInvoicesTable.invoiceNumber,
  totalAmount: tenantInvoicesTable.totalAmount,
  outstandingAmount: tenantInvoicesTable.outstandingAmount,
  tenantName: tenantsTable.businessName,
  ownerName: tenantsTable.ownerName,
  phone: tenantsTable.phone,
} as const;

// ─── GET /api/pending-payments ────────────────────────────────────────────────
router.get("/pending-payments", async (req, res) => {
  try {
    const { status } = req.query;

    const statuses = status && status !== "all"
      ? [String(status)]
      : ["pending_review", "approved", "rejected"];

    const rows = await db
      .select(pendingPaymentSelect)
      .from(tenantPaymentsTable)
      .leftJoin(
        tenantInvoicesTable,
        eq(tenantPaymentsTable.invoiceId, tenantInvoicesTable.id),
      )
      .leftJoin(
        tenantsTable,
        eq(tenantPaymentsTable.tenantId, tenantsTable.id),
      )
      .where(
        and(
          inArray(tenantPaymentsTable.approvalStatus, statuses),
          tenantPaymentsTable.invoiceId !== null
            ? undefined
            : undefined,
        ),
      )
      .orderBy(desc(tenantPaymentsTable.createdAt));

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Gagal mengambil data pembayaran" });
  }
});

// ─── GET /api/pending-payments/count ─────────────────────────────────────────
router.get("/pending-payments/count", async (_req, res) => {
  try {
    const rows = await db
      .select({ id: tenantPaymentsTable.id })
      .from(tenantPaymentsTable)
      .where(eq(tenantPaymentsTable.approvalStatus, "pending_review"));

    res.json({ count: rows.length });
  } catch {
    res.json({ count: 0 });
  }
});

// ─── POST /api/pending-payments/:id/approve ───────────────────────────────────
router.post("/pending-payments/:id/approve", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid" }); return; }

  try {
    const result = await db.transaction(async (tx) => {
      const [payment] = await tx
        .select()
        .from(tenantPaymentsTable)
        .where(eq(tenantPaymentsTable.id, id))
        .for("update");

      if (!payment) throw Object.assign(new Error("Pembayaran tidak ditemukan"), { status: 404 });
      if (payment.approvalStatus !== "pending_review") {
        throw Object.assign(
          new Error("Pembayaran ini sudah diproses sebelumnya"),
          { status: 409 },
        );
      }

      if (!payment.invoiceId) {
        throw Object.assign(new Error("Pembayaran tidak terhubung ke invoice"), { status: 400 });
      }

      const [invoice] = await tx
        .select()
        .from(tenantInvoicesTable)
        .where(eq(tenantInvoicesTable.id, payment.invoiceId))
        .for("update");

      if (!invoice) throw Object.assign(new Error("Invoice tidak ditemukan"), { status: 404 });
      if (invoice.status === "cancelled") {
        throw Object.assign(new Error("Invoice telah dibatalkan"), { status: 409 });
      }

      const approvedBy = req.user?.name ?? req.user?.email ?? "Admin";
      const now = new Date();

      const ledger = await approveExistingPayment(tx, payment.id, invoice.id, approvedBy, now);

      const [updatedPayment] = await tx
        .select()
        .from(tenantPaymentsTable)
        .where(eq(tenantPaymentsTable.id, id));

      const [updatedInvoice] = await tx
        .select()
        .from(tenantInvoicesTable)
        .where(eq(tenantInvoicesTable.id, invoice.id));

      return { payment: updatedPayment!, invoice: updatedInvoice!, ledger };
    });

    logAudit(req, {
      action: "approve_payment",
      entityType: "payment",
      entityId: id,
      afterData: { paymentId: id, approvedBy: req.user?.name, invoiceStatus: result.invoice.status },
    });

    sseBroker.publish("payment_approved", {
      paymentId: id,
      invoiceId: result.invoice.id,
    });

    writePaymentEvent({
      sourceApp: "tenant_management",
      ownerApp: "tenant_management",
      sourceModule: "tenant_invoice",
      sourceTable: "tenant_payments",
      sourceId: result.payment.id,
      tenantId: result.payment.tenantId ?? null,
      siteId: result.payment.siteId ?? null,
      invoiceId: result.payment.invoiceId ?? null,
      amount: parseFloat(String(result.payment.amount)),
      direction: "IN",
      paymentMethod: normalizePaymentMethod(result.payment.paymentMethod ?? "transfer"),
      paymentReference: result.payment.referenceNumber ?? null,
      proofUrl: result.payment.proofUrl ?? result.payment.proofImageUrl ?? null,
      paymentStatus: "confirmed",
      metadata: {
        receiptNumber: result.payment.receiptNumber,
        approvedBy: req.user?.name ?? req.user?.email ?? "Admin",
        invoiceStatus: result.invoice.status,
      },
    }).catch(() => {});

    if (result.invoice.tenantId) {
      const [tenant] = await db
        .select({ ownerName: tenantsTable.ownerName, businessName: tenantsTable.businessName, phone: tenantsTable.phone })
        .from(tenantsTable)
        .where(eq(tenantsTable.id, result.invoice.tenantId));

      if (tenant?.phone) {
        await sendPaymentApproved({
          ownerName: tenant.ownerName,
          businessName: tenant.businessName,
          invoiceNumber: result.invoice.invoiceNumber,
          amount: result.payment.amount,
          phone: tenant.phone,
        }).catch(() => {});
      }
    }

    res.json({ success: true, payment: result.payment, invoice: result.invoice });
  } catch (err) {
    if (err instanceof LedgerError) {
      const httpCode = err.code === "OVERPAYMENT" ? 400 : 409;
      res.status(httpCode).json({ error: err.message, code: err.code });
      return;
    }
    const e = err as Error & { status?: number };
    if (e.status) {
      res.status(e.status).json({ error: e.message });
    } else {
      res.status(500).json({ error: "Gagal menyetujui pembayaran" });
    }
  }
});

// ─── POST /api/pending-payments/:id/reject ────────────────────────────────────
const rejectSchema = z.object({
  reason: z.string().min(1, "Alasan penolakan wajib diisi"),
});

router.post("/pending-payments/:id/reject", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid" }); return; }

  const parsed = rejectSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Data tidak valid" });
    return;
  }

  try {
    const [payment] = await db
      .select()
      .from(tenantPaymentsTable)
      .where(eq(tenantPaymentsTable.id, id));

    if (!payment) { res.status(404).json({ error: "Pembayaran tidak ditemukan" }); return; }
    if (payment.approvalStatus !== "pending_review") {
      res.status(409).json({ error: "Pembayaran ini sudah diproses sebelumnya" });
      return;
    }

    const [updated] = await db
      .update(tenantPaymentsTable)
      .set({
        approvalStatus: "rejected",
        rejectionReason: parsed.data.reason,
        updatedAt: new Date(),
      })
      .where(eq(tenantPaymentsTable.id, id))
      .returning();

    logAudit(req, {
      action: "reject_payment",
      entityType: "payment",
      entityId: id,
      afterData: { paymentId: id, reason: parsed.data.reason },
    });

    sseBroker.publish("payment_rejected", { paymentId: id });

    if (payment.tenantId) {
      const [invoiceData] = payment.invoiceId
        ? await db
            .select({ invoiceNumber: tenantInvoicesTable.invoiceNumber })
            .from(tenantInvoicesTable)
            .where(eq(tenantInvoicesTable.id, payment.invoiceId))
        : [null];

      const [tenant] = await db
        .select({ ownerName: tenantsTable.ownerName, businessName: tenantsTable.businessName, phone: tenantsTable.phone })
        .from(tenantsTable)
        .where(eq(tenantsTable.id, payment.tenantId));

      if (tenant?.phone && invoiceData?.invoiceNumber) {
        await sendPaymentRejected({
          ownerName: tenant.ownerName,
          businessName: tenant.businessName,
          invoiceNumber: invoiceData.invoiceNumber,
          rejectionReason: parsed.data.reason,
          phone: tenant.phone,
        }).catch(() => {});
      }
    }

    res.json({ success: true, payment: updated });
  } catch (err) {
    res.status(500).json({ error: "Gagal menolak pembayaran" });
  }
});

export default router;
