/**
 * Fonnte Incoming Message Webhook
 *
 * Konfigurasi di Fonnte dashboard → Webhook URL:
 *   https://{domain}/api/whatsapp/webhook
 *
 * Keamanan opsional: set FONNTE_WEBHOOK_SECRET di Replit Secrets,
 * lalu isi "Webhook Secret" di Fonnte dashboard dengan nilai yang sama.
 * Jika tidak diset, semua request diterima (aman selama endpoint tidak diketahui publik).
 *
 * Format pesan yang dikenali (dikirim admin ke WA bot):
 *   SETUJU {paymentId}          → approve pembayaran
 *   TOLAK {paymentId} {alasan}  → reject pembayaran + kirim WA ke tenant
 */

import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  tenantPaymentsTable,
  tenantInvoicesTable,
  tenantsTable,
} from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { sseBroker } from "../lib/sse-broker";
import {
  sendPaymentApproved,
  sendPaymentRejected,
} from "../lib/whatsapp";

const router: IRouter = Router();

// ─── POST /api/whatsapp/webhook ───────────────────────────────────────────────
router.post("/whatsapp/webhook", async (req, res) => {
  // Segera balas 200 agar Fonnte tidak retry
  res.json({ ok: true });

  // Verifikasi secret jika dikonfigurasi
  const webhookSecret = process.env.FONNTE_WEBHOOK_SECRET;
  const incomingSecret =
    (req.headers["x-webhook-secret"] as string | undefined) ??
    String(req.body?.secret ?? "");

  if (webhookSecret && incomingSecret !== webhookSecret) {
    logger.warn({ ip: req.ip }, "[wa-webhook] secret tidak cocok, diabaikan");
    return;
  }

  // Fonnte body: { device, sender, message, member, name }
  // Abaikan pesan dari grup (member !== 0)
  const member = Number(req.body?.member ?? 0);
  if (member !== 0) return;

  const rawMessage: string = String(req.body?.message ?? req.body?.text ?? "").trim();
  const senderPhone: string = String(req.body?.sender ?? "").trim();

  if (!rawMessage || !senderPhone) return;

  // Parse perintah
  const approveMatch = rawMessage.match(/^SETUJU\s+(\d+)$/i);
  const rejectMatch = rawMessage.match(/^TOLAK\s+(\d+)\s+(.+)$/i);

  if (approveMatch) {
    const paymentId = Number(approveMatch[1]);
    await handleApprove(paymentId, senderPhone);
  } else if (rejectMatch) {
    const paymentId = Number(rejectMatch[1]);
    const reason = rejectMatch[2].trim();
    await handleReject(paymentId, reason, senderPhone);
  }
  // Pesan tidak dikenali → abaikan
});

// ─── handleApprove ────────────────────────────────────────────────────────────
async function handleApprove(paymentId: number, approverPhone: string) {
  try {
    const result = await db.transaction(async (tx) => {
      const [payment] = await tx
        .select()
        .from(tenantPaymentsTable)
        .where(eq(tenantPaymentsTable.id, paymentId))
        .for("update");

      if (!payment) {
        throw Object.assign(new Error("Pembayaran tidak ditemukan"), { status: 404 });
      }
      if (payment.approvalStatus !== "pending_review") {
        throw Object.assign(new Error("Pembayaran sudah diproses"), { status: 409 });
      }
      if (!payment.invoiceId) {
        throw Object.assign(new Error("Tidak ada invoice terkait"), { status: 400 });
      }

      const [invoice] = await tx
        .select()
        .from(tenantInvoicesTable)
        .where(eq(tenantInvoicesTable.id, payment.invoiceId))
        .for("update");

      if (!invoice) {
        throw Object.assign(new Error("Invoice tidak ditemukan"), { status: 404 });
      }
      if (invoice.status === "cancelled") {
        throw Object.assign(new Error("Invoice telah dibatalkan"), { status: 409 });
      }

      const now = new Date();
      const [updatedPayment] = await tx
        .update(tenantPaymentsTable)
        .set({
          approvalStatus: "approved",
          approvedBy: `WA:${approverPhone}`,
          approvedAt: now,
          paidAt: now,
          paymentStatus: "PAID",
          status: "PAID",
          updatedAt: now,
        })
        .where(eq(tenantPaymentsTable.id, paymentId))
        .returning();

      const newPaid = Number(invoice.paidAmount) + Number(payment.amount);
      const total = Number(invoice.totalAmount);
      const outstanding = Math.max(total - newPaid, 0);

      const newStatus =
        newPaid >= total
          ? "paid"
          : newPaid > 0
            ? "partial"
            : invoice.dueDate && new Date(invoice.dueDate) < now
              ? "overdue"
              : "unpaid";

      const [updatedInvoice] = await tx
        .update(tenantInvoicesTable)
        .set({
          paidAmount: String(newPaid),
          outstandingAmount: String(outstanding),
          status: newStatus,
          updatedAt: now,
        })
        .where(eq(tenantInvoicesTable.id, invoice.id))
        .returning();

      return { payment: updatedPayment, invoice: updatedInvoice };
    });

    sseBroker.publish("payment_approved", {
      paymentId,
      invoiceId: result.invoice.id,
    });

    // WA konfirmasi ke tenant
    if (result.invoice.tenantId) {
      const [tenant] = await db
        .select({
          ownerName: tenantsTable.ownerName,
          businessName: tenantsTable.businessName,
          phone: tenantsTable.phone,
        })
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

    logger.info(
      { paymentId, approverPhone },
      "[wa-webhook] pembayaran disetujui via WA",
    );
  } catch (err) {
    logger.warn(
      { err, paymentId, approverPhone },
      "[wa-webhook] gagal approve pembayaran",
    );
  }
}

// ─── handleReject ─────────────────────────────────────────────────────────────
async function handleReject(paymentId: number, reason: string, approverPhone: string) {
  try {
    const [payment] = await db
      .select()
      .from(tenantPaymentsTable)
      .where(eq(tenantPaymentsTable.id, paymentId));

    if (!payment) {
      logger.warn({ paymentId }, "[wa-webhook] pembayaran tidak ditemukan");
      return;
    }
    if (payment.approvalStatus !== "pending_review") {
      logger.warn({ paymentId }, "[wa-webhook] pembayaran sudah diproses");
      return;
    }

    await db
      .update(tenantPaymentsTable)
      .set({
        approvalStatus: "rejected",
        rejectionReason: reason,
        approvedBy: `WA:${approverPhone}`,
        updatedAt: new Date(),
      })
      .where(eq(tenantPaymentsTable.id, paymentId));

    sseBroker.publish("payment_rejected", { paymentId });

    // WA notifikasi ditolak ke tenant
    if (payment.tenantId && payment.invoiceId) {
      const [[invoiceData], [tenant]] = await Promise.all([
        db
          .select({ invoiceNumber: tenantInvoicesTable.invoiceNumber })
          .from(tenantInvoicesTable)
          .where(eq(tenantInvoicesTable.id, payment.invoiceId)),
        db
          .select({
            ownerName: tenantsTable.ownerName,
            businessName: tenantsTable.businessName,
            phone: tenantsTable.phone,
          })
          .from(tenantsTable)
          .where(eq(tenantsTable.id, payment.tenantId)),
      ]);

      if (tenant?.phone && invoiceData?.invoiceNumber) {
        await sendPaymentRejected({
          ownerName: tenant.ownerName,
          businessName: tenant.businessName,
          invoiceNumber: invoiceData.invoiceNumber,
          rejectionReason: reason,
          phone: tenant.phone,
        }).catch(() => {});
      }
    }

    logger.info(
      { paymentId, reason, approverPhone },
      "[wa-webhook] pembayaran ditolak via WA",
    );
  } catch (err) {
    logger.warn({ err, paymentId }, "[wa-webhook] gagal reject pembayaran");
  }
}

export default router;
