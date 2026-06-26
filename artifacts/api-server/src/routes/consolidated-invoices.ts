import { Router } from "express";
import { db } from "@workspace/db";
import {
  consolidatedInvoicesTable,
  consolidatedInvoiceItemsTable,
  tenantInvoicesTable,
  tenantPaymentsTable,
  tenantsTable,
  mallSitesTable,
} from "@workspace/db/schema";
import { eq, and, inArray, sql, desc, asc } from "drizzle-orm";
import { z } from "zod";
import { logAudit } from "../lib/audit";
import { sendConsolidatedInvoiceNotification, getSiteCompanyName } from "../lib/whatsapp";
import { recordPayment, LedgerError } from "../lib/payment-ledger";

const router = Router();

// ── Helper: sync paid/outstanding/status pada consolidated invoice dari individual invoices ──
type TxOrDb = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

async function syncConsolidatedStatus(tx: TxOrDb, consolidatedId: number): Promise<void> {
  const [header] = await tx
    .select({ totalAmount: consolidatedInvoicesTable.totalAmount })
    .from(consolidatedInvoicesTable)
    .where(eq(consolidatedInvoicesTable.id, consolidatedId));
  if (!header) return;

  const items = await tx
    .select({ invoiceId: consolidatedInvoiceItemsTable.invoiceId })
    .from(consolidatedInvoiceItemsTable)
    .where(eq(consolidatedInvoiceItemsTable.consolidatedInvoiceId, consolidatedId));

  const invoiceIds = items.map((i) => i.invoiceId);
  let paidAmount = 0;
  if (invoiceIds.length > 0) {
    const [sumRow] = await tx
      .select({ sumPaid: sql<string>`coalesce(sum(paid_amount::numeric), 0)::text` })
      .from(tenantInvoicesTable)
      .where(inArray(tenantInvoicesTable.id, invoiceIds));
    paidAmount = parseFloat(sumRow?.sumPaid ?? "0");
  }

  const total = Number(header.totalAmount);
  const outstanding = Math.max(total - paidAmount, 0);
  const status = paidAmount >= total ? "paid" : paidAmount > 0 ? "partial" : "unpaid";

  await tx
    .update(consolidatedInvoicesTable)
    .set({ paidAmount: String(paidAmount), outstandingAmount: String(outstanding), status, updatedAt: new Date() })
    .where(eq(consolidatedInvoicesTable.id, consolidatedId));
}

// ── Generate nomor invoice konsolidasi ───────────────────────────────────────
async function generateConsolidatedInvoiceNumber(siteId: number | null): Promise<string> {
  const now = new Date();
  const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;

  let prefix = "KONS";
  if (siteId) {
    const [site] = await db
      .select({ invoicePrefix: mallSitesTable.invoicePrefix })
      .from(mallSitesTable)
      .where(eq(mallSitesTable.id, siteId));
    if (site?.invoicePrefix) prefix = site.invoicePrefix;
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(consolidatedInvoicesTable)
    .where(
      and(
        sql`invoice_number LIKE ${`%/KONS/${yyyymm}/%`}`,
        siteId ? eq(consolidatedInvoicesTable.siteId, siteId) : sql`true`
      )
    );

  const seq = String((count ?? 0) + 1).padStart(3, "0");
  return `${prefix}/KONS/${yyyymm}/${seq}`;
}

// ── GET /api/consolidated-invoices ───────────────────────────────────────────
router.get("/consolidated-invoices", async (req, res) => {
  try {
    const siteId = req.siteId > 0 ? req.siteId : null;

    const rows = await db
      .select({
        id: consolidatedInvoicesTable.id,
        invoiceNumber: consolidatedInvoicesTable.invoiceNumber,
        tenantId: consolidatedInvoicesTable.tenantId,
        tenantName: tenantsTable.businessName,
        tenantOwner: tenantsTable.ownerName,
        periodLabel: consolidatedInvoicesTable.periodLabel,
        dueDate: consolidatedInvoicesTable.dueDate,
        totalAmount: consolidatedInvoicesTable.totalAmount,
        paidAmount: consolidatedInvoicesTable.paidAmount,
        outstandingAmount: consolidatedInvoicesTable.outstandingAmount,
        status: consolidatedInvoicesTable.status,
        notes: consolidatedInvoicesTable.notes,
        createdAt: consolidatedInvoicesTable.createdAt,
        itemCount: sql<number>`(
          SELECT count(*) FROM consolidated_invoice_items
          WHERE consolidated_invoice_id = ${consolidatedInvoicesTable.id}
        )::int`,
      })
      .from(consolidatedInvoicesTable)
      .innerJoin(tenantsTable, eq(consolidatedInvoicesTable.tenantId, tenantsTable.id))
      .where(siteId ? eq(consolidatedInvoicesTable.siteId, siteId) : sql`true`)
      .orderBy(desc(consolidatedInvoicesTable.createdAt));

    res.json(rows);
  } catch (err) {
    req.log.error(err, "Gagal mengambil consolidated invoices");
    res.status(500).json({ error: "Gagal mengambil data" });
  }
});

// ── GET /api/consolidated-invoices/all-unpaid ─────────────────────────────────
// PENTING: Route ini harus SEBELUM /:id agar tidak ditangkap sebagai ID
// Ambil SEMUA invoice unpaid/partial/overdue di site ini (lintas tenant)
router.get("/consolidated-invoices/all-unpaid", async (req, res) => {
  try {
    const siteId = req.siteId > 0 ? req.siteId : null;

    // Invoice yang sudah masuk consolidated aktif
    const alreadyConsolidated = await db
      .select({ invoiceId: consolidatedInvoiceItemsTable.invoiceId })
      .from(consolidatedInvoiceItemsTable)
      .innerJoin(
        consolidatedInvoicesTable,
        eq(consolidatedInvoiceItemsTable.consolidatedInvoiceId, consolidatedInvoicesTable.id)
      )
      .where(inArray(consolidatedInvoicesTable.status, ["unpaid", "partial", "draft"]));

    const excludedIds = alreadyConsolidated.map((r) => r.invoiceId);

    const invoices = await db
      .select({
        id: tenantInvoicesTable.id,
        tenantId: tenantInvoicesTable.tenantId,
        tenantName: tenantsTable.businessName,
        tenantOwner: tenantsTable.ownerName,
        invoiceNumber: tenantInvoicesTable.invoiceNumber,
        unitCode: tenantInvoicesTable.unitCode,
        periodStart: tenantInvoicesTable.periodStart,
        periodEnd: tenantInvoicesTable.periodEnd,
        dueDate: tenantInvoicesTable.dueDate,
        totalAmount: tenantInvoicesTable.totalAmount,
        paidAmount: tenantInvoicesTable.paidAmount,
        outstandingAmount: tenantInvoicesTable.outstandingAmount,
        status: tenantInvoicesTable.status,
      })
      .from(tenantInvoicesTable)
      .innerJoin(tenantsTable, eq(tenantInvoicesTable.tenantId, tenantsTable.id))
      .where(
        and(
          inArray(tenantInvoicesTable.status, ["unpaid", "partial", "overdue"]),
          siteId ? eq(tenantInvoicesTable.siteId, siteId) : sql`true`,
          excludedIds.length > 0
            ? sql`${tenantInvoicesTable.id} NOT IN (${sql.join(excludedIds.map((id) => sql`${id}`), sql`, `)})`
            : sql`true`
        )
      )
      .orderBy(tenantsTable.businessName, tenantInvoicesTable.dueDate);

    res.json(invoices);
  } catch (err) {
    req.log.error(err, "Gagal mengambil semua unpaid invoices");
    res.status(500).json({ error: "Gagal mengambil data invoice" });
  }
});

// ── GET /api/consolidated-invoices/tenant/:tenantId/unpaid-invoices ───────────
// PENTING: Route ini harus SEBELUM /:id
// Ambil invoice unpaid/partial milik tenant untuk dipilih saat buat konsolidasi
router.get("/consolidated-invoices/tenant/:tenantId/unpaid-invoices", async (req, res) => {
  const tenantId = Number(req.params.tenantId);
  if (isNaN(tenantId)) { res.status(400).json({ error: "ID tidak valid" }); return; }

  try {
    const siteId = req.siteId > 0 ? req.siteId : null;

    // Invoice yang sudah masuk consolidated aktif
    const alreadyConsolidated = await db
      .select({ invoiceId: consolidatedInvoiceItemsTable.invoiceId })
      .from(consolidatedInvoiceItemsTable)
      .innerJoin(
        consolidatedInvoicesTable,
        eq(consolidatedInvoiceItemsTable.consolidatedInvoiceId, consolidatedInvoicesTable.id)
      )
      .where(
        and(
          eq(consolidatedInvoicesTable.tenantId, tenantId),
          inArray(consolidatedInvoicesTable.status, ["unpaid", "partial", "draft"])
        )
      );

    const excludedIds = alreadyConsolidated.map((r) => r.invoiceId);

    const invoices = await db
      .select({
        id: tenantInvoicesTable.id,
        invoiceNumber: tenantInvoicesTable.invoiceNumber,
        unitCode: tenantInvoicesTable.unitCode,
        periodStart: tenantInvoicesTable.periodStart,
        periodEnd: tenantInvoicesTable.periodEnd,
        dueDate: tenantInvoicesTable.dueDate,
        totalAmount: tenantInvoicesTable.totalAmount,
        paidAmount: tenantInvoicesTable.paidAmount,
        outstandingAmount: tenantInvoicesTable.outstandingAmount,
        status: tenantInvoicesTable.status,
      })
      .from(tenantInvoicesTable)
      .where(
        and(
          eq(tenantInvoicesTable.tenantId, tenantId),
          inArray(tenantInvoicesTable.status, ["unpaid", "partial", "overdue"]),
          siteId ? eq(tenantInvoicesTable.siteId, siteId) : sql`true`,
          excludedIds.length > 0
            ? sql`${tenantInvoicesTable.id} NOT IN (${sql.join(excludedIds.map((id) => sql`${id}`), sql`, `)})`
            : sql`true`
        )
      )
      .orderBy(tenantInvoicesTable.dueDate);

    res.json(invoices);
  } catch (err) {
    req.log.error(err, "Gagal mengambil unpaid invoices tenant");
    res.status(500).json({ error: "Gagal mengambil data invoice" });
  }
});

// ── GET /api/consolidated-invoices/:id ───────────────────────────────────────
router.get("/consolidated-invoices/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid" }); return; }

    const [header] = await db
      .select({
        id: consolidatedInvoicesTable.id,
        invoiceNumber: consolidatedInvoicesTable.invoiceNumber,
        tenantId: consolidatedInvoicesTable.tenantId,
        tenantName: tenantsTable.businessName,
        tenantOwner: tenantsTable.ownerName,
        tenantPhone: tenantsTable.phone,
        periodLabel: consolidatedInvoicesTable.periodLabel,
        periodStart: consolidatedInvoicesTable.periodStart,
        periodEnd: consolidatedInvoicesTable.periodEnd,
        dueDate: consolidatedInvoicesTable.dueDate,
        totalAmount: consolidatedInvoicesTable.totalAmount,
        paidAmount: consolidatedInvoicesTable.paidAmount,
        outstandingAmount: consolidatedInvoicesTable.outstandingAmount,
        status: consolidatedInvoicesTable.status,
        paymentToken: consolidatedInvoicesTable.paymentToken,
        notes: consolidatedInvoicesTable.notes,
        createdAt: consolidatedInvoicesTable.createdAt,
        updatedAt: consolidatedInvoicesTable.updatedAt,
      })
      .from(consolidatedInvoicesTable)
      .innerJoin(tenantsTable, eq(consolidatedInvoicesTable.tenantId, tenantsTable.id))
      .where(eq(consolidatedInvoicesTable.id, id));

    if (!header) { res.status(404).json({ error: "Invoice tidak ditemukan" }); return; }

    const items = await db
      .select({
        id: consolidatedInvoiceItemsTable.id,
        invoiceId: consolidatedInvoiceItemsTable.invoiceId,
        invoiceNumber: tenantInvoicesTable.invoiceNumber,
        unitCode: consolidatedInvoiceItemsTable.unitCode,
        description: consolidatedInvoiceItemsTable.description,
        amount: consolidatedInvoiceItemsTable.amount,
        dueDate: tenantInvoicesTable.dueDate,
        invoiceStatus: tenantInvoicesTable.status,
        invoicePaidAmount: tenantInvoicesTable.paidAmount,
        invoiceOutstanding: tenantInvoicesTable.outstandingAmount,
      })
      .from(consolidatedInvoiceItemsTable)
      .innerJoin(tenantInvoicesTable, eq(consolidatedInvoiceItemsTable.invoiceId, tenantInvoicesTable.id))
      .where(eq(consolidatedInvoiceItemsTable.consolidatedInvoiceId, id))
      .orderBy(asc(tenantInvoicesTable.dueDate));

    // Auto-sync status dari individual invoices setiap kali detail dibuka
    await syncConsolidatedStatus(db, id);
    const [refreshedHeader] = await db
      .select({
        id: consolidatedInvoicesTable.id,
        invoiceNumber: consolidatedInvoicesTable.invoiceNumber,
        tenantId: consolidatedInvoicesTable.tenantId,
        tenantName: tenantsTable.businessName,
        tenantOwner: tenantsTable.ownerName,
        tenantPhone: tenantsTable.phone,
        periodLabel: consolidatedInvoicesTable.periodLabel,
        periodStart: consolidatedInvoicesTable.periodStart,
        periodEnd: consolidatedInvoicesTable.periodEnd,
        dueDate: consolidatedInvoicesTable.dueDate,
        totalAmount: consolidatedInvoicesTable.totalAmount,
        paidAmount: consolidatedInvoicesTable.paidAmount,
        outstandingAmount: consolidatedInvoicesTable.outstandingAmount,
        status: consolidatedInvoicesTable.status,
        paymentToken: consolidatedInvoicesTable.paymentToken,
        notes: consolidatedInvoicesTable.notes,
        createdAt: consolidatedInvoicesTable.createdAt,
        updatedAt: consolidatedInvoicesTable.updatedAt,
      })
      .from(consolidatedInvoicesTable)
      .innerJoin(tenantsTable, eq(consolidatedInvoicesTable.tenantId, tenantsTable.id))
      .where(eq(consolidatedInvoicesTable.id, id));

    res.json({ ...(refreshedHeader ?? header), items });
  } catch (err) {
    req.log.error(err, "Gagal mengambil detail consolidated invoice");
    res.status(500).json({ error: "Gagal mengambil data" });
  }
});

// ── POST /api/consolidated-invoices ──────────────────────────────────────────
const createSchema = z.object({
  tenantId: z.number().int().positive().optional(),
  invoiceIds: z.array(z.number().int().positive()).min(2, "Minimal 2 invoice harus dipilih"),
  periodLabel: z.string().optional(),
  dueDate: z.string().optional(),
  notes: z.string().optional(),
});

router.post("/consolidated-invoices", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Data tidak valid", detail: parsed.error.flatten().fieldErrors });
    return;
  }

  const { invoiceIds, periodLabel, dueDate, notes } = parsed.data;
  const siteId = req.siteId > 0 ? req.siteId : null;

  try {
    const invoices = await db
      .select({
        id: tenantInvoicesTable.id,
        tenantId: tenantInvoicesTable.tenantId,
        invoiceNumber: tenantInvoicesTable.invoiceNumber,
        unitCode: tenantInvoicesTable.unitCode,
        bookingId: tenantInvoicesTable.bookingId,
        outstandingAmount: tenantInvoicesTable.outstandingAmount,
        totalAmount: tenantInvoicesTable.totalAmount,
        status: tenantInvoicesTable.status,
        periodStart: tenantInvoicesTable.periodStart,
        periodEnd: tenantInvoicesTable.periodEnd,
      })
      .from(tenantInvoicesTable)
      .where(inArray(tenantInvoicesTable.id, invoiceIds));

    if (invoices.length !== invoiceIds.length) {
      res.status(400).json({ error: "Beberapa invoice tidak ditemukan" });
      return;
    }

    const tenantId = parsed.data.tenantId ?? invoices[0].tenantId;

    const alreadyPaid = invoices.filter((inv) => inv.status === "paid" || inv.status === "cancelled");
    if (alreadyPaid.length > 0) {
      res.status(400).json({
        error: `Invoice ${alreadyPaid.map((i) => i.invoiceNumber).join(", ")} sudah lunas/dibatalkan`,
      });
      return;
    }

    const existingItems = await db
      .select({ invoiceId: consolidatedInvoiceItemsTable.invoiceId })
      .from(consolidatedInvoiceItemsTable)
      .innerJoin(
        consolidatedInvoicesTable,
        eq(consolidatedInvoiceItemsTable.consolidatedInvoiceId, consolidatedInvoicesTable.id)
      )
      .where(
        and(
          inArray(consolidatedInvoiceItemsTable.invoiceId, invoiceIds),
          inArray(consolidatedInvoicesTable.status, ["unpaid", "partial", "draft"])
        )
      );

    if (existingItems.length > 0) {
      const dupIds = existingItems.map((e) => e.invoiceId).join(", ");
      res.status(409).json({ error: `Invoice ID ${dupIds} sudah termasuk dalam invoice konsolidasi yang aktif` });
      return;
    }

    const totalAmount = invoices.reduce((sum, inv) => sum + Number(inv.outstandingAmount), 0);
    const invoiceNumber = await generateConsolidatedInvoiceNumber(siteId);

    const result = await db.transaction(async (tx) => {
      const [header] = await tx
        .insert(consolidatedInvoicesTable)
        .values({
          siteId: siteId ?? undefined,
          invoiceNumber,
          tenantId,
          periodLabel: periodLabel ?? null,
          dueDate: dueDate ?? null,
          totalAmount: String(totalAmount),
          paidAmount: "0",
          outstandingAmount: String(totalAmount),
          status: "unpaid",
          notes: notes ?? null,
        })
        .returning();

      const itemValues = invoices.map((inv) => ({
        consolidatedInvoiceId: header.id,
        invoiceId: inv.id,
        bookingId: inv.bookingId ?? null,
        unitCode: inv.unitCode ?? null,
        description: `Invoice ${inv.invoiceNumber}${inv.unitCode ? ` — ${inv.unitCode}` : ""}`,
        amount: String(inv.outstandingAmount),
      }));

      const items = await tx.insert(consolidatedInvoiceItemsTable).values(itemValues).returning();

      return { header, items };
    });

    logAudit(req, {
      action: "create_consolidated_invoice",
      entityType: "consolidated_invoice",
      entityId: result.header.id,
      afterData: { invoiceNumber, tenantId, totalAmount, invoiceCount: invoices.length },
    });

    res.status(201).json(result.header);
  } catch (err) {
    req.log.error(err, "Gagal membuat consolidated invoice");
    res.status(500).json({ error: "Gagal membuat invoice konsolidasi" });
  }
});

// ── PATCH /api/consolidated-invoices/:id ─────────────────────────────────────
const updateSchema = z.object({
  dueDate: z.string().optional().nullable(),
  periodLabel: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  status: z.enum(["draft", "unpaid", "partial", "paid", "cancelled"]).optional(),
});

router.patch("/consolidated-invoices/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid" }); return; }

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Data tidak valid", detail: parsed.error.flatten().fieldErrors });
    return;
  }

  try {
    const [existing] = await db
      .select({ id: consolidatedInvoicesTable.id, status: consolidatedInvoicesTable.status })
      .from(consolidatedInvoicesTable)
      .where(eq(consolidatedInvoicesTable.id, id));

    if (!existing) { res.status(404).json({ error: "Invoice tidak ditemukan" }); return; }

    const updates: Partial<typeof consolidatedInvoicesTable.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (parsed.data.dueDate !== undefined) updates.dueDate = parsed.data.dueDate ?? undefined;
    if (parsed.data.periodLabel !== undefined) updates.periodLabel = parsed.data.periodLabel ?? undefined;
    if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes ?? undefined;
    if (parsed.data.status) updates.status = parsed.data.status;

    const [updated] = await db
      .update(consolidatedInvoicesTable)
      .set(updates)
      .where(eq(consolidatedInvoicesTable.id, id))
      .returning();

    res.json(updated);
  } catch (err) {
    req.log.error(err, "Gagal update consolidated invoice");
    res.status(500).json({ error: "Gagal memperbarui invoice" });
  }
});

// ── DELETE /api/consolidated-invoices/:id ────────────────────────────────────
router.delete("/consolidated-invoices/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid" }); return; }

  try {
    const [existing] = await db
      .select({ id: consolidatedInvoicesTable.id, status: consolidatedInvoicesTable.status, invoiceNumber: consolidatedInvoicesTable.invoiceNumber })
      .from(consolidatedInvoicesTable)
      .where(eq(consolidatedInvoicesTable.id, id));

    if (!existing) { res.status(404).json({ error: "Invoice tidak ditemukan" }); return; }
    if (existing.status === "paid") {
      res.status(409).json({ error: "Invoice yang sudah lunas tidak bisa dihapus" });
      return;
    }

    await db.delete(consolidatedInvoicesTable).where(eq(consolidatedInvoicesTable.id, id));

    logAudit(req, {
      action: "delete_consolidated_invoice",
      entityType: "consolidated_invoice",
      entityId: id,
      beforeData: { invoiceNumber: existing.invoiceNumber, status: existing.status },
    });

    res.json({ ok: true });
  } catch (err) {
    req.log.error(err, "Gagal hapus consolidated invoice");
    res.status(500).json({ error: "Gagal menghapus invoice" });
  }
});

// ── POST /api/consolidated-invoices/:id/send-wa ───────────────────────────────
router.post("/consolidated-invoices/:id/send-wa", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid" }); return; }

  try {
    const [header] = await db
      .select({
        id: consolidatedInvoicesTable.id,
        invoiceNumber: consolidatedInvoicesTable.invoiceNumber,
        tenantId: consolidatedInvoicesTable.tenantId,
        tenantName: tenantsTable.businessName,
        tenantOwner: tenantsTable.ownerName,
        tenantPhone: tenantsTable.phone,
        periodLabel: consolidatedInvoicesTable.periodLabel,
        dueDate: consolidatedInvoicesTable.dueDate,
        totalAmount: consolidatedInvoicesTable.totalAmount,
        paidAmount: consolidatedInvoicesTable.paidAmount,
        outstandingAmount: consolidatedInvoicesTable.outstandingAmount,
        status: consolidatedInvoicesTable.status,
        siteId: consolidatedInvoicesTable.siteId,
      })
      .from(consolidatedInvoicesTable)
      .innerJoin(tenantsTable, eq(consolidatedInvoicesTable.tenantId, tenantsTable.id))
      .where(eq(consolidatedInvoicesTable.id, id));

    if (!header) { res.status(404).json({ error: "Invoice tidak ditemukan" }); return; }

    if (!header.tenantPhone) {
      res.status(422).json({ error: "Nomor WhatsApp tenant belum diisi. Lengkapi data tenant terlebih dahulu." });
      return;
    }

    if (header.status === "paid") {
      res.status(409).json({ error: "Invoice ini sudah lunas" });
      return;
    }

    const items = await db
      .select({
        unitCode: consolidatedInvoiceItemsTable.unitCode,
        invoiceNumber: tenantInvoicesTable.invoiceNumber,
        amount: consolidatedInvoiceItemsTable.amount,
        invoiceOutstanding: tenantInvoicesTable.outstandingAmount,
      })
      .from(consolidatedInvoiceItemsTable)
      .innerJoin(tenantInvoicesTable, eq(consolidatedInvoiceItemsTable.invoiceId, tenantInvoicesTable.id))
      .where(eq(consolidatedInvoiceItemsTable.consolidatedInvoiceId, id));

    const companyName = await getSiteCompanyName(header.siteId);

    const result = await sendConsolidatedInvoiceNotification({
      phone: header.tenantPhone,
      ownerName: header.tenantOwner,
      businessName: header.tenantName,
      invoiceNumber: header.invoiceNumber,
      periodLabel: header.periodLabel,
      dueDate: header.dueDate,
      totalAmount: header.totalAmount,
      paidAmount: header.paidAmount,
      outstandingAmount: header.outstandingAmount,
      items,
      companyName,
    });

    logAudit(req, {
      action: "send_wa_consolidated_invoice",
      entityType: "consolidated_invoice",
      entityId: id,
      afterData: { invoiceNumber: header.invoiceNumber, phone: header.tenantPhone, waResult: result.ok },
    });

    if (!result.ok) {
      res.status(502).json({ error: result.error ?? "Gagal mengirim WhatsApp" });
      return;
    }

    res.json({ ok: true, pending: result.pending ?? false });
  } catch (err) {
    req.log.error(err, "Gagal kirim WA consolidated invoice");
    res.status(500).json({ error: "Gagal mengirim WhatsApp" });
  }
});

// ── POST /consolidated-invoices/:id/record-payment ──────────────────────────
// Admin catat pembayaran → distribusikan ke invoice individual (FIFO by due_date)
const recordPaymentSchema = z.object({
  amount: z.union([z.string(), z.number()]).transform((v) => Number(v)),
  paymentMethod: z.enum(["tunai", "transfer", "qris", "edc", "other"]).default("transfer"),
  referenceNumber: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  paidAt: z.string().optional().nullable(),
});

router.post("/consolidated-invoices/:id/record-payment", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid" }); return; }

  const parsed = recordPaymentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Data tidak valid", detail: parsed.error.flatten().fieldErrors });
    return;
  }

  const { amount, paymentMethod, referenceNumber, notes, paidAt } = parsed.data;

  if (amount <= 0) {
    res.status(400).json({ error: "Jumlah pembayaran harus lebih dari 0" });
    return;
  }

  try {
    const siteId = req.siteId > 0 ? req.siteId : null;

    // 1. Ambil header consolidated invoice
    const [consolidated] = await db
      .select({
        id: consolidatedInvoicesTable.id,
        invoiceNumber: consolidatedInvoicesTable.invoiceNumber,
        tenantId: consolidatedInvoicesTable.tenantId,
        status: consolidatedInvoicesTable.status,
        totalAmount: consolidatedInvoicesTable.totalAmount,
        outstandingAmount: consolidatedInvoicesTable.outstandingAmount,
      })
      .from(consolidatedInvoicesTable)
      .where(eq(consolidatedInvoicesTable.id, id));

    if (!consolidated) { res.status(404).json({ error: "Invoice tidak ditemukan" }); return; }
    if (consolidated.status === "paid") { res.status(409).json({ error: "Invoice ini sudah lunas" }); return; }
    if (consolidated.status === "cancelled") { res.status(409).json({ error: "Invoice sudah dibatalkan" }); return; }

    // 2. Sync dulu outstanding terkini dari individual invoices
    await syncConsolidatedStatus(db, id);
    const [fresh] = await db
      .select({ outstandingAmount: consolidatedInvoicesTable.outstandingAmount })
      .from(consolidatedInvoicesTable)
      .where(eq(consolidatedInvoicesTable.id, id));

    const currentOutstanding = Number(fresh?.outstandingAmount ?? consolidated.outstandingAmount);
    if (amount > currentOutstanding * 1.001) {
      res.status(400).json({
        error: `Jumlah melebihi sisa tagihan (${formatRupiahServer(currentOutstanding)})`,
      });
      return;
    }

    // 3. Ambil item diurutkan berdasarkan due_date ASC (FIFO)
    const items = await db
      .select({
        invoiceId: consolidatedInvoiceItemsTable.invoiceId,
        bookingId: tenantInvoicesTable.bookingId,
        outstandingAmount: tenantInvoicesTable.outstandingAmount,
      })
      .from(consolidatedInvoiceItemsTable)
      .innerJoin(tenantInvoicesTable, eq(consolidatedInvoiceItemsTable.invoiceId, tenantInvoicesTable.id))
      .where(eq(consolidatedInvoiceItemsTable.consolidatedInvoiceId, id))
      .orderBy(asc(tenantInvoicesTable.dueDate));

    // 4. Hitung distribusi FIFO
    const distributions: { invoiceId: number; bookingId: number | null; amount: number }[] = [];
    let remaining = amount;
    for (const item of items) {
      if (remaining <= 0.001) break;
      const outstanding = Math.max(Number(item.outstandingAmount), 0);
      if (outstanding <= 0) continue;
      const toPay = Math.min(outstanding, remaining);
      distributions.push({ invoiceId: item.invoiceId, bookingId: item.bookingId ?? null, amount: toPay });
      remaining -= toPay;
    }

    if (distributions.length === 0) {
      res.status(400).json({ error: "Semua invoice dalam konsolidasi sudah lunas" });
      return;
    }

    // 5. Generate nomor kwitansi dasar
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const receiptPrefix = `KONS-PAY-${datePart}-`;
    const [cntRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tenantPaymentsTable)
      .where(sql`receipt_number LIKE ${receiptPrefix + "%"}`);
    const baseSeq = ((cntRow?.count ?? 0) + 1).toString().padStart(4, "0");
    const baseReceipt = `${receiptPrefix}${baseSeq}`;

    // 6. Eksekusi semua pembayaran dalam satu transaksi
    const paidAtDate = paidAt ? new Date(paidAt) : new Date();

    await db.transaction(async (tx) => {
      for (let i = 0; i < distributions.length; i++) {
        const dist = distributions[i];
        await recordPayment(tx, {
          invoiceId: dist.invoiceId,
          amount: dist.amount,
          paymentMethod,
          sourceType: "manual",
          receiptNumber: `${baseReceipt}-${String(i + 1).padStart(2, "0")}`,
          referenceNumber: referenceNumber ?? null,
          notes: notes
            ? `[Kons: ${consolidated.invoiceNumber}] ${notes}`
            : `Pembayaran via Invoice Konsolidasi ${consolidated.invoiceNumber}`,
          paidAt: paidAtDate,
          siteId,
          tenantId: consolidated.tenantId,
          bookingId: dist.bookingId,
        });
      }

      // 7. Sync status consolidated setelah semua pembayaran
      await syncConsolidatedStatus(tx, id);
    });

    // 8. Ambil data terbaru untuk respons
    const [updated] = await db
      .select({
        id: consolidatedInvoicesTable.id,
        invoiceNumber: consolidatedInvoicesTable.invoiceNumber,
        status: consolidatedInvoicesTable.status,
        paidAmount: consolidatedInvoicesTable.paidAmount,
        outstandingAmount: consolidatedInvoicesTable.outstandingAmount,
        totalAmount: consolidatedInvoicesTable.totalAmount,
      })
      .from(consolidatedInvoicesTable)
      .where(eq(consolidatedInvoicesTable.id, id));

    logAudit(req, {
      action: "record_consolidated_payment",
      entityType: "consolidated_invoice",
      entityId: id,
      afterData: {
        invoiceNumber: consolidated.invoiceNumber,
        amount,
        paymentMethod,
        distributedTo: distributions.length,
        baseReceipt,
      },
    });

    res.status(201).json({
      ok: true,
      invoice: updated,
      baseReceiptNumber: baseReceipt,
      distributedCount: distributions.length,
    });
  } catch (err) {
    if (err instanceof LedgerError) {
      res.status(400).json({ error: err.message });
      return;
    }
    req.log.error(err, "Gagal catat pembayaran konsolidasi");
    res.status(500).json({ error: "Gagal mencatat pembayaran" });
  }
});

function formatRupiahServer(n: number): string {
  return `Rp ${n.toLocaleString("id-ID")}`;
}

export default router;
