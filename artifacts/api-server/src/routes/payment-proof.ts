import { Router, type Request, type Response, type IRouter } from "express";
import multer from "multer";
import path from "path";
import crypto from "crypto";
import { db } from "@workspace/db";
import { tenantInvoicesTable, tenantPaymentsTable, tenantsTable, systemSettingsTable, waLogsTable } from "@workspace/db/schema";
import { eq, sql, and, desc } from "drizzle-orm";
import { z } from "zod";
import { sseBroker } from "../lib/sse-broker";
import { sendPaymentReceived, sendAdminPaymentAlert } from "../lib/whatsapp";
import { uploadRateLimiter } from "../middlewares/rate-limit";
import { uploadToStorage } from "../lib/supabase-storage";
import { getBaseUrl } from "../lib/app-url";

/** Ambil nomor WA admin dari env (prioritas) atau settings DB */
async function getAdminPhone(): Promise<string | null> {
  if (process.env.ADMIN_WHATSAPP) return process.env.ADMIN_WHATSAPP;
  try {
    const [row] = await db
      .select({ value: systemSettingsTable.value })
      .from(systemSettingsTable)
      .where(eq(systemSettingsTable.key, "mall_config"));
    const phone = (row?.value as Record<string, unknown> | undefined)?.adminPhone;
    return typeof phone === "string" && phone.length > 0 ? phone : null;
  } catch {
    return null;
  }
}

/** Bangun URL review pembayaran — prioritas: DB → APP_URL → REPLIT_DEV_DOMAIN */
async function buildReviewLink(): Promise<string> {
  const base = await getBaseUrl();
  return base ? `${base}/tinjau-pembayaran` : "/tinjau-pembayaran";
}

const router: IRouter = Router();

const PROOF_ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

const uploadProof = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (PROOF_ALLOWED_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Format tidak diizinkan. Gunakan JPG, PNG, WEBP, atau PDF."));
    }
  },
});

function runMulter(
  mw: multer.Multer,
  field: string,
): (req: Request, res: Response) => Promise<void> {
  return (req, res) =>
    new Promise<void>((resolve, reject) => {
      mw.single(field)(req, res, (err) => (err ? reject(err) : resolve()));
    });
}

// ─── GET /api/pay/:token ──────────────────────────────────────────────────────
// Public — ambil info invoice berdasarkan token
router.get("/pay/:token", async (req, res) => {
  const { token } = req.params;
  if (!token) { res.status(400).json({ error: "Token tidak valid" }); return; }

  try {
    const [invoice] = await db
      .select({
        id: tenantInvoicesTable.id,
        invoiceNumber: tenantInvoicesTable.invoiceNumber,
        periodStart: tenantInvoicesTable.periodStart,
        periodEnd: tenantInvoicesTable.periodEnd,
        dueDate: tenantInvoicesTable.dueDate,
        totalAmount: tenantInvoicesTable.totalAmount,
        paidAmount: tenantInvoicesTable.paidAmount,
        outstandingAmount: tenantInvoicesTable.outstandingAmount,
        status: tenantInvoicesTable.status,
        tenantId: tenantInvoicesTable.tenantId,
        unitCode: tenantInvoicesTable.unitCode,
        tenantName: tenantsTable.businessName,
        ownerName: tenantsTable.ownerName,
      })
      .from(tenantInvoicesTable)
      .leftJoin(tenantsTable, eq(tenantInvoicesTable.tenantId, tenantsTable.id))
      .where(eq(tenantInvoicesTable.paymentToken, token as string));

    if (!invoice) {
      res.status(404).json({ error: "Link pembayaran tidak ditemukan atau sudah tidak valid" });
      return;
    }

    if (invoice.status === "cancelled") {
      res.status(410).json({ error: "Invoice ini telah dibatalkan" });
      return;
    }

    if (invoice.status === "paid") {
      res.status(200).json({ ...invoice, alreadyPaid: true });
      return;
    }

    res.json({ ...invoice, alreadyPaid: false });
  } catch (err) {
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

// ─── POST /api/pay/:token/proof ───────────────────────────────────────────────
// Public — submit bukti pembayaran (multer, pending_review)
const proofBodySchema = z.object({
  amount: z.union([z.string(), z.number()]).transform((v) => Number(v)),
  paymentMethod: z.enum(["tunai", "transfer", "qris", "edc", "other"]).default("transfer"),
  referenceNumber: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

router.post("/pay/:token/proof", uploadRateLimiter, async (req, res) => {
  const { token } = req.params;
  if (!token) { res.status(400).json({ error: "Token tidak valid" }); return; }

  try {
    await runMulter(uploadProof, "proof")(req, res);
  } catch (err) {
    const msg =
      err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE"
        ? "File terlalu besar. Maksimal 5MB."
        : (err as Error).message ?? "Upload gagal";
    res.status(400).json({ error: msg });
    return;
  }

  const parsed = proofBodySchema.safeParse(req.body);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    res.status(400).json({ error: msg });
    return;
  }

  const { amount, paymentMethod, referenceNumber, notes } = parsed.data;

  if (amount <= 0) {
    res.status(400).json({ error: "Jumlah pembayaran harus lebih dari 0" });
    return;
  }

  try {
    const [invoice] = await db
      .select({
        id: tenantInvoicesTable.id,
        invoiceNumber: tenantInvoicesTable.invoiceNumber,
        tenantId: tenantInvoicesTable.tenantId,
        bookingId: tenantInvoicesTable.bookingId,
        siteId: tenantInvoicesTable.siteId,
        status: tenantInvoicesTable.status,
        ownerName: tenantsTable.ownerName,
        businessName: tenantsTable.businessName,
        phone: tenantsTable.phone,
      })
      .from(tenantInvoicesTable)
      .leftJoin(tenantsTable, eq(tenantInvoicesTable.tenantId, tenantsTable.id))
      .where(eq(tenantInvoicesTable.paymentToken, token as string));

    if (!invoice) {
      res.status(404).json({ error: "Link pembayaran tidak ditemukan" });
      return;
    }

    if (invoice.status === "cancelled") {
      res.status(410).json({ error: "Invoice ini telah dibatalkan" });
      return;
    }

    if (invoice.status === "paid") {
      res.status(409).json({ error: "Invoice ini sudah lunas" });
      return;
    }

    let proofUrl: string | null = null;
    if (req.file) {
      const ext = path.extname(req.file.originalname).toLowerCase() || ".jpg";
      const filename = `${crypto.randomUUID()}${ext}`;
      proofUrl = await uploadToStorage("payment-proofs", filename, req.file.buffer, req.file.mimetype);
    }

    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const prefix = `TENANT-PAY-${datePart}-`;
    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tenantPaymentsTable)
      .where(sql`receipt_number LIKE ${prefix + "%"}`);
    const seq = ((countRow?.count ?? 0) + 1).toString().padStart(4, "0");
    const receiptNumber = `${prefix}${seq}`;

    const [payment] = await db
      .insert(tenantPaymentsTable)
      .values({
        ...(invoice.siteId ? { siteId: invoice.siteId } : {}),
        invoiceId: invoice.id,
        tenantId: invoice.tenantId,
        bookingId: invoice.bookingId ?? null,
        tenantBookingId: invoice.bookingId ?? null,
        amount: String(amount),
        discountAmount: "0",
        penaltyAmount: "0",
        paymentMethod,
        method: paymentMethod,
        paymentStatus: "PENDING",
        status: "PENDING",
        receiptNumber,
        referenceNumber: referenceNumber ?? null,
        proofUrl,
        proofImageUrl: proofUrl,
        notes: notes ?? null,
        approvalStatus: "pending_review",
      })
      .returning();

    sseBroker.publish("payment_proof_submitted", {
      paymentId: payment.id,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
    });

    if (invoice.phone) {
      // Cooldown 1 jam per invoice — cegah spam saat tenant re-upload berkali-kali
      const [recentWa] = await db
        .select({ id: waLogsTable.id })
        .from(waLogsTable)
        .where(and(
          eq(waLogsTable.invoiceId, invoice.id),
          eq(waLogsTable.messageType, "payment_received"),
          eq(waLogsTable.status, "sent"),
          sql`${waLogsTable.createdAt} > NOW() - INTERVAL '1 hour'`,
        ))
        .limit(1);

      if (!recentWa) {
        await sendPaymentReceived({
          ownerName: invoice.ownerName ?? "Tenant",
          businessName: invoice.businessName ?? "",
          invoiceNumber: invoice.invoiceNumber,
          amount,
          phone: invoice.phone,
        }).catch(() => {});
      }
    }

    // Notifikasi admin via WA — fire-and-forget (selalu kirim agar admin tahu ada upload baru)
    getAdminPhone().then(async (adminPhone) => {
      if (!adminPhone) return;
      sendAdminPaymentAlert({
        ownerName: invoice.ownerName ?? "Tenant",
        businessName: invoice.businessName ?? "",
        invoiceNumber: invoice.invoiceNumber,
        amount,
        paymentMethod,
        referenceNumber: referenceNumber ?? null,
        paymentId: payment.id,
        adminPhone,
        reviewLink: await buildReviewLink(),
      }).catch(() => {});
    }).catch(() => {});

    res.status(201).json({
      success: true,
      message: "Bukti pembayaran berhasil dikirim. Menunggu verifikasi admin.",
      receiptNumber,
      paymentId: payment.id,
    });
  } catch (err) {
    res.status(500).json({ error: "Gagal menyimpan bukti pembayaran" });
  }
});

export default router;
