import { Router, type Request, type Response, type IRouter } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { db } from "@workspace/db";
import { tenantInvoicesTable, tenantPaymentsTable, tenantsTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { sseBroker } from "../lib/sse-broker";
import { sendPaymentReceived } from "../lib/whatsapp";
import { uploadRateLimiter } from "../middlewares/rate-limit";

const router: IRouter = Router();

const UPLOAD_DIR = path.join(process.cwd(), "uploads");

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const PROOF_ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

const uploadProof = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = path.join(UPLOAD_DIR, "payment-proofs");
      ensureDir(dir);
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, crypto.randomUUID() + ext);
    },
  }),
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
      .where(eq(tenantInvoicesTable.paymentToken, token));

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
      .where(eq(tenantInvoicesTable.paymentToken, token));

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

    const proofUrl = req.file
      ? `/uploads/payment-proofs/${req.file.filename}`
      : null;

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
      await sendPaymentReceived({
        ownerName: invoice.ownerName ?? "Tenant",
        businessName: invoice.businessName ?? "",
        invoiceNumber: invoice.invoiceNumber,
        amount,
        phone: invoice.phone,
      }).catch(() => {});
    }

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
