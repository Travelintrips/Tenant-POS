import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { tenantPaymentsTable, tenantInvoicesTable, tenantsTable, paymentReceiptsTable } from "@workspace/db/schema";
import { eq, sql, desc, and } from "drizzle-orm";
import { z } from "zod";
import { logAudit } from "../lib/audit";
import { LedgerError, recordPayment } from "../lib/payment-ledger";

const router: IRouter = Router();

const createPaymentSchema = z.object({
  invoiceId: z.number().int().positive(),
  amount: z.number().positive("Jumlah harus lebih dari 0"),
  paymentMethod: z.enum(["tunai", "transfer", "qris", "edc", "other"]).default("tunai"),
  referenceId: z.string().min(1).optional(),
  sourceType: z.enum(["pos", "ocr", "bank", "manual"]).default("manual"),
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

  try {
    const result = await db.transaction(async (tx) => {
      const [invoice] = await tx
        .select({
          id: tenantInvoicesTable.id,
          tenantId: tenantInvoicesTable.tenantId,
          bookingId: tenantInvoicesTable.bookingId,
          siteId: tenantInvoicesTable.siteId,
          status: tenantInvoicesTable.status,
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

      const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const prefix = `PAY-${datePart}-`;
      const [countRow] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(tenantPaymentsTable)
        .where(sql`receipt_number LIKE ${prefix + "%"}`);
      const seq = ((countRow?.count ?? 0) + 1).toString().padStart(4, "0");
      const receiptNumber = `${prefix}${seq}`;

      return await recordPayment(tx, {
        invoiceId,
        amount,
        paymentMethod,
        sourceType,
        receiptNumber,
        referenceId: referenceId ?? null,
        referenceNumber: referenceNumber ?? null,
        notes: notes ?? null,
        shiftId: shiftId ?? null,
        paidAt: paidAt ? new Date(paidAt) : null,
        tenantId: invoice.tenantId ?? null,
        bookingId: invoice.bookingId ?? null,
        siteId: invoice.siteId ?? null,
      });
    });

    logAudit(req, {
      action: "create_payment",
      entityType: "tenant_payments",
      entityId: result.ledgerEntryId,
      afterData: {
        paymentId: result.ledgerEntryId,
        invoiceId,
        amount,
        paymentMethod,
        sourceType,
        referenceId: referenceId ?? null,
        invoiceStatus: result.invoiceStatus,
      },
    });

    // Generate receipt entry — fire-and-forget (non-blocking)
    void (async () => {
      try {
        const [inv] = await db
          .select({
            invoiceNumber: tenantInvoicesTable.invoiceNumber,
            tenantId: tenantInvoicesTable.tenantId,
            siteId: tenantInvoicesTable.siteId,
          })
          .from(tenantInvoicesTable)
          .where(eq(tenantInvoicesTable.id, invoiceId));

        const tenantRow = inv?.tenantId
          ? await db
              .select({ ownerName: tenantsTable.ownerName, businessName: tenantsTable.businessName })
              .from(tenantsTable)
              .where(eq(tenantsTable.id, inv.tenantId))
              .then((r) => r[0])
          : null;

        await db.insert(paymentReceiptsTable).values({
          paymentId: result.ledgerEntryId,
          invoiceId,
          tenantId: inv?.tenantId ?? 0,
          siteId: inv?.siteId ?? null,
          receiptNumber: result.receiptNumber,
          fileUrl: "",
          invoiceNumber: inv?.invoiceNumber ?? null,
          businessName: tenantRow?.businessName ?? null,
          ownerName: tenantRow?.ownerName ?? null,
          amountPaid: String(amount),
          taxAmount: "0",
          netAmount: String(amount),
          paymentMethod,
          kasirName: req.user?.name ?? "Admin",
          waStatus: "skipped",
        }).onConflictDoNothing();
      } catch {
        // Non-critical
      }
    })();

    res.status(201).json({
      success: true,
      ledgerId: result.ledgerEntryId,
      invoiceStatus: result.invoiceStatus,
      paidAmount: result.paidAmount,
      remaining: result.remaining,
      remainingBalanceAfter: result.remainingBalanceAfter,
      receiptId: result.receiptNumber,
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

// ─── GET /api/payments?invoiceId=X ────────────────────────────────────────────
// Daftar semua entri ledger untuk satu invoice, diurutkan dari terbaru.
router.get("/payments", async (req, res) => {
  const invoiceId = parseInt(String(req.query.invoiceId ?? ""), 10);
  if (isNaN(invoiceId) || invoiceId <= 0) {
    res.status(400).json({ error: "Parameter invoiceId wajib diisi" });
    return;
  }

  try {
    const rows = await db
      .select({
        id: tenantPaymentsTable.id,
        invoiceId: tenantPaymentsTable.invoiceId,
        tenantId: tenantPaymentsTable.tenantId,
        amount: tenantPaymentsTable.amount,
        paymentMethod: tenantPaymentsTable.paymentMethod,
        sourceType: tenantPaymentsTable.sourceType,
        approvalStatus: tenantPaymentsTable.approvalStatus,
        receiptNumber: tenantPaymentsTable.receiptNumber,
        referenceId: tenantPaymentsTable.referenceId,
        referenceNumber: tenantPaymentsTable.referenceNumber,
        notes: tenantPaymentsTable.notes,
        paidAt: tenantPaymentsTable.paidAt,
        isVoided: tenantPaymentsTable.isVoided,
        remainingBalanceAfter: tenantPaymentsTable.remainingBalanceAfter,
        proofUrl: tenantPaymentsTable.proofUrl,
        createdAt: tenantPaymentsTable.createdAt,
      })
      .from(tenantPaymentsTable)
      .where(
        and(
          eq(tenantPaymentsTable.invoiceId, invoiceId),
          eq(tenantPaymentsTable.isVoided, false),
        ),
      )
      .orderBy(desc(tenantPaymentsTable.createdAt));

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("[GET /payments]", err);
    res.status(500).json({ error: "Gagal mengambil riwayat pembayaran" });
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
