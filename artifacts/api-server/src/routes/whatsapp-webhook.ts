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
  tenantReceiptsTable,
  tenantsTable,
  usersTable,
} from "@workspace/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { logger } from "../lib/logger";
import { sseBroker } from "../lib/sse-broker";
import {
  sendPaymentApproved,
  sendPaymentRejected,
  notifyAdminGroup,
} from "../lib/whatsapp";
import { webhookRateLimiter } from "../middlewares/rate-limit";
import { approveExistingPayment } from "../lib/payment-ledger";
import { postTenantPaymentAccountingEntry } from "../lib/accounting-entry";
import { writePaymentEvent, normalizePaymentMethod } from "../lib/payment-events";
import { isLikelyYearAmount } from "../lib/ocr-service";

const router: IRouter = Router();

// ─── POST /api/webhook/fonnte ─────────────────────────────────────────────────
// Fonnte Delivery Status Callback — dipanggil Fonnte setiap kali status pesan
// berubah (pending → sent / failed). Harus public (sebelum requireAuth).
// Format body: { id, target, message, status, statusType, reason, device }
router.post("/webhook/fonnte", webhookRateLimiter, async (req, res) => {
  res.json({ ok: true });

  const body = req.body as Record<string, unknown>;
  const msgId = String(body["id"] ?? "");
  const target = String(body["target"] ?? "");
  const statusType = String(body["statusType"] ?? body["status"] ?? "");
  const reason = String(body["reason"] ?? "");

  if (msgId || target) {
    logger.info(
      { id: msgId, target, statusType, reason },
      "[wa-delivery] Fonnte delivery callback",
    );
  }
});

// ─── POST /api/whatsapp/webhook ───────────────────────────────────────────────
router.post("/whatsapp/webhook", webhookRateLimiter, async (req, res) => {
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

  // Jika FONNTE_WEBHOOK_SECRET tidak diset, verifikasi nomor pengirim
  // harus terdaftar sebagai admin/owner/finance di DB agar tidak bisa
  // dieksploitasi oleh siapa pun yang mengetahui paymentId.
  if (!webhookSecret) {
    const [authorizedUser] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.phoneNumber, senderPhone),
          inArray(usersTable.role, ["owner", "admin", "finance"]),
        ),
      )
      .limit(1);

    if (!authorizedUser) {
      logger.warn(
        { ip: req.ip, senderPhone },
        "[wa-webhook] FONNTE_WEBHOOK_SECRET tidak diset — pengirim tidak terdaftar sebagai admin, diabaikan",
      );
      return;
    }
  }

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
export async function handleApprove(paymentId: number, approverPhone: string) {
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

      // Samakan guard dengan approval dari portal admin. Nominal yang jelas
      // terlihat seperti tahun hasil OCR tidak boleh lolos lewat jalur WhatsApp.
      if (
        isLikelyYearAmount(Number(payment.amount)) &&
        Number(invoice.outstandingAmount ?? invoice.totalAmount ?? 0) >= 100_000
      ) {
        throw Object.assign(
          new Error("Nominal pembayaran terlihat seperti angka tahun hasil OCR"),
          { status: 422, code: "OCR_AMOUNT_SUSPICIOUS" },
        );
      }

      const now = new Date();
      await approveExistingPayment(
        tx,
        payment.id,
        invoice.id,
        `WA:${approverPhone}`,
        now,
      );

      const [updatedPayment] = await tx
        .select()
        .from(tenantPaymentsTable)
        .where(eq(tenantPaymentsTable.id, payment.id));

      const [updatedInvoice] = await tx
        .select()
        .from(tenantInvoicesTable)
        .where(eq(tenantInvoicesTable.id, invoice.id));

      return { payment: updatedPayment!, invoice: updatedInvoice! };
    });

    sseBroker.publish("payment_approved", {
      paymentId,
      invoiceId: result.invoice.id,
    });

    const tenant = result.invoice.tenantId
      ? await db
          .select({
            ownerName: tenantsTable.ownerName,
            businessName: tenantsTable.businessName,
            phone: tenantsTable.phone,
          })
          .from(tenantsTable)
          .where(eq(tenantsTable.id, result.invoice.tenantId))
          .then((rows) => rows[0])
      : null;

    // Jalur approval WhatsApp wajib menghasilkan side-effect keuangan yang sama
    // dengan approval dari panel admin. Semua writer di bawah idempotent.
    await db
      .insert(tenantReceiptsTable)
      .values({
        paymentId: result.payment.id,
        invoiceId: result.invoice.id,
        tenantId: result.payment.tenantId ?? 0,
        siteId: result.payment.siteId ?? null,
        receiptNumber: result.payment.receiptNumber ?? `RCT-${result.payment.id}`,
        fileUrl: "",
        invoiceNumber: result.invoice.invoiceNumber,
        businessName: tenant?.businessName ?? null,
        ownerName: tenant?.ownerName ?? null,
        amountPaid: String(result.payment.amount),
        taxAmount: "0",
        netAmount: String(result.payment.amount),
        paymentMethod: result.payment.paymentMethod ?? null,
        kasirName: `WA:${approverPhone}`,
        waStatus: "skipped",
      })
      .onConflictDoNothing();

    await postTenantPaymentAccountingEntry({
      paymentId: result.payment.id,
      siteId: result.payment.siteId ?? null,
      invoiceNumber: result.invoice.invoiceNumber ?? null,
      businessName: tenant?.businessName ?? null,
      amountPaid: Number(result.payment.amount),
      paymentMethod: result.payment.paymentMethod ?? "transfer",
      transactionDate: result.payment.paidAt ?? new Date(),
      receiptNumber: result.payment.receiptNumber ?? `RCT-${result.payment.id}`,
      sourceModule: "payment_proof_approval",
    });

    await writePaymentEvent({
      sourceApp: "tenant_management",
      ownerApp: "tenant_management",
      sourceModule: "tenant_invoice",
      sourceTable: "tenant_payments",
      sourceId: result.payment.id,
      tenantId: result.payment.tenantId ?? null,
      siteId: result.payment.siteId ?? null,
      invoiceId: result.payment.invoiceId ?? null,
      amount: Number(result.payment.amount),
      direction: "IN",
      paymentMethod: normalizePaymentMethod(result.payment.paymentMethod ?? "transfer"),
      paymentReference: result.payment.referenceNumber ?? null,
      proofUrl: result.payment.proofUrl ?? result.payment.proofImageUrl ?? null,
      paymentStatus: "confirmed",
      metadata: {
        receiptNumber: result.payment.receiptNumber,
        approvedBy: `WA:${approverPhone}`,
        invoiceStatus: result.invoice.status,
      },
    });

    if (tenant?.phone) {
      await sendPaymentApproved({
        ownerName: tenant.ownerName,
        businessName: tenant.businessName,
        invoiceNumber: result.invoice.invoiceNumber,
        amount: result.payment.amount,
        phone: tenant.phone,
      }).catch(() => {});
    }

    await notifyAdminGroup({
      eventType: "payment_approved",
      businessName: tenant?.businessName ?? "Tenant",
      ownerName: tenant?.ownerName ?? "-",
      invoiceNumber: result.invoice.invoiceNumber,
      receiptNumber: result.payment.receiptNumber,
      amount: result.payment.amount,
      paymentMethod: result.payment.paymentMethod ?? undefined,
    }).catch(() => {});

    logger.info(
      { paymentId, approverPhone },
      "[wa-webhook] pembayaran disetujui via WA melalui canonical ledger",
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
