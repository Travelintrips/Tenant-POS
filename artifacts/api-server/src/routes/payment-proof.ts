import { Router, type Request, type Response, type IRouter } from "express";
import multer from "multer";
import path from "path";
import crypto from "crypto";
import { db } from "@workspace/db";
import { tenantInvoicesTable, tenantPaymentsTable, tenantsTable, systemSettingsTable, waLogsTable, usersTable } from "@workspace/db/schema";
import { eq, sql, and, inArray } from "drizzle-orm";
import { z } from "zod";
import { sseBroker } from "../lib/sse-broker";
import { sendPaymentReceived, sendAdminPaymentAlert } from "../lib/whatsapp";
import { uploadRateLimiter } from "../middlewares/rate-limit";
import { uploadToStorage } from "../lib/supabase-storage";
import { getBaseUrl } from "../lib/app-url";
import { extractAmountFromFile } from "../lib/ocr-service";

/** Ambil semua nomor WA owner/admin yang aktif dari DB, fallback ke env */
async function getOwnerPhones(): Promise<Array<{ name: string; phone: string }>> {
  try {
    const rows = await db
      .select({ name: usersTable.name, phoneNumber: usersTable.phoneNumber })
      .from(usersTable)
      .where(
        and(
          inArray(usersTable.role, ["owner", "admin"]),
          eq(usersTable.status, "active"),
          sql`phone_number IS NOT NULL AND phone_number != ''`,
        ),
      );

    const result = rows
      .filter((u) => u.phoneNumber)
      .map((u) => ({ name: u.name, phone: u.phoneNumber! }));

    // Fallback ke env ADMIN_WHATSAPP atau settings DB jika tidak ada owner/admin dengan HP
    if (result.length === 0) {
      const envPhone = process.env.ADMIN_WHATSAPP ?? process.env.FONNTE_ADMIN_WA;
      if (envPhone) return [{ name: "Admin", phone: envPhone }];

      const [row] = await db
        .select({ value: systemSettingsTable.value })
        .from(systemSettingsTable)
        .where(eq(systemSettingsTable.key, "mall_config"));
      const phone = (row?.value as Record<string, unknown> | undefined)?.adminPhone;
      if (typeof phone === "string" && phone.length > 0) {
        return [{ name: "Admin", phone }];
      }
    }

    return result;
  } catch {
    return [];
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

// ─── POST /api/pay/:token/scan-proof ─────────────────────────────────────────
// Public — OCR scan bukti pembayaran, kembalikan extractedAmount (non-blocking)
const uploadScan = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (PROOF_ALLOWED_MIME.has(file.mimetype)) cb(null, true);
    else cb(new Error("Format tidak diizinkan"));
  },
});

router.post("/pay/:token/scan-proof", uploadRateLimiter, async (req, res) => {
  const { token } = req.params;
  if (!token) { res.status(400).json({ error: "Token tidak valid" }); return; }

  try {
    await runMulter(uploadScan, "proof")(req, res);
  } catch {
    res.status(400).json({ error: "Upload gagal" });
    return;
  }

  if (!req.file) {
    res.status(400).json({ error: "File tidak ditemukan" });
    return;
  }

  // Jalankan OCR non-blocking — timeout 30 detik agar tidak hang
  try {
    const timeoutMs = 30_000;
    const ocrPromise = extractAmountFromFile(req.file.buffer, req.file.mimetype);
    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));

    const result = await Promise.race([ocrPromise, timeoutPromise]);

    if (!result) {
      res.json({ success: true, extractedAmount: null, confidence: 0, rawText: "" });
      return;
    }

    res.json({
      success: true,
      extractedAmount: result.extractedAmount,
      confidence: result.confidence,
      rawText: result.rawText.slice(0, 500),
    });
  } catch {
    res.json({ success: true, extractedAmount: null, confidence: 0, rawText: "" });
  }
});

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
  ocrExtractedAmount: z.union([z.string(), z.number()]).transform((v) => Number(v) || null).optional().nullable(),
  ocrRawText: z.string().optional().nullable(),
  ocrConfidence: z.union([z.string(), z.number()]).transform((v) => Number(v) || null).optional().nullable(),
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

  const { amount, paymentMethod, referenceNumber, notes, ocrExtractedAmount, ocrRawText, ocrConfidence } = parsed.data;

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
        sourceType: "ocr",
        ...(ocrExtractedAmount != null ? { ocrExtractedAmount: String(ocrExtractedAmount) } : {}),
        ...(ocrRawText ? { ocrRawText } : {}),
        ...(ocrConfidence != null ? { ocrConfidence: String(ocrConfidence) } : {}),
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

    // Notifikasi ke semua owner/admin via WA — fire-and-forget
    getOwnerPhones().then(async (owners) => {
      if (owners.length === 0) return;
      const reviewLink = await buildReviewLink();
      await Promise.allSettled(
        owners.map((owner) =>
          sendAdminPaymentAlert({
            ownerName: invoice.ownerName ?? "Tenant",
            businessName: invoice.businessName ?? "",
            invoiceNumber: invoice.invoiceNumber,
            amount,
            paymentMethod,
            referenceNumber: referenceNumber ?? null,
            paymentId: payment.id,
            adminPhone: owner.phone,
            reviewLink,
          }),
        ),
      );
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
