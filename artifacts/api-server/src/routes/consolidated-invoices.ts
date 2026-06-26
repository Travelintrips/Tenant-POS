import { Router } from "express";
import { db } from "@workspace/db";
import {
  consolidatedInvoicesTable,
  consolidatedInvoiceItemsTable,
  tenantInvoicesTable,
  tenantsTable,
  mallSitesTable,
} from "@workspace/db/schema";
import { eq, and, inArray, sql, desc } from "drizzle-orm";
import { z } from "zod";
import { logAudit } from "../lib/audit";
import { sendConsolidatedInvoiceNotification, getSiteCompanyName } from "../lib/whatsapp";

const router = Router();

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
        invoiceStatus: tenantInvoicesTable.status,
        invoicePaidAmount: tenantInvoicesTable.paidAmount,
        invoiceOutstanding: tenantInvoicesTable.outstandingAmount,
      })
      .from(consolidatedInvoiceItemsTable)
      .innerJoin(tenantInvoicesTable, eq(consolidatedInvoiceItemsTable.invoiceId, tenantInvoicesTable.id))
      .where(eq(consolidatedInvoiceItemsTable.consolidatedInvoiceId, id));

    res.json({ ...header, items });
  } catch (err) {
    req.log.error(err, "Gagal mengambil detail consolidated invoice");
    res.status(500).json({ error: "Gagal mengambil data" });
  }
});

// ── POST /api/consolidated-invoices ──────────────────────────────────────────
const createSchema = z.object({
  tenantId: z.number().int().positive(),
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

  const { tenantId, invoiceIds, periodLabel, dueDate, notes } = parsed.data;
  const siteId = req.siteId > 0 ? req.siteId : null;

  try {
    // Ambil invoice-invoice yang dipilih
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

    // Validasi semua invoice milik tenant yang sama
    const wrongTenant = invoices.find((inv) => inv.tenantId !== tenantId);
    if (wrongTenant) {
      res.status(400).json({ error: `Invoice ${wrongTenant.invoiceNumber} bukan milik tenant ini` });
      return;
    }

    // Validasi tidak ada invoice yang sudah lunas
    const alreadyPaid = invoices.filter((inv) => inv.status === "paid" || inv.status === "cancelled");
    if (alreadyPaid.length > 0) {
      res.status(400).json({
        error: `Invoice ${alreadyPaid.map((i) => i.invoiceNumber).join(", ")} sudah lunas/dibatalkan`,
      });
      return;
    }

    // Cek apakah invoice sudah masuk consolidated invoice lain
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

// ── GET /api/consolidated-invoices/tenant/:tenantId/unpaid-invoices ───────────
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

// ── POST /api/consolidated-invoices/:id/send-wa ───────────────────────────────
router.post("/consolidated-invoices/:id/send-wa", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid" }); return; }

  try {
    // Ambil header invoice + data tenant
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

    // Ambil item-item invoice
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

export default router;
