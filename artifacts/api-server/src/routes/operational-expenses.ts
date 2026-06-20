import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { operationalExpensesTable, tenantsTable, mallSitesTable } from "@workspace/db/schema";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import { z } from "zod";
import { logAudit } from "../lib/audit";

const router: IRouter = Router();

const VALID_CATEGORIES = ["listrik", "internet", "perbaikan", "lain-lain"] as const;
const VALID_METHODS = ["cash", "transfer", "e-wallet", "lainnya"] as const;

const expenseSchema = z.object({
  siteId: z.number().int().positive().optional().nullable(),
  tenantId: z.number().int().positive().optional().nullable(),
  category: z.enum(VALID_CATEGORIES).default("lain-lain"),
  description: z.string().max(500).optional().nullable(),
  amount: z.number().positive("Nominal harus lebih dari 0"),
  paymentMethod: z.enum(VALID_METHODS).default("cash"),
  paidAt: z.string().datetime().optional().nullable(),
  receiptUrl: z.string().url().optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

// ─── GET /api/operational-expenses ────────────────────────────────────────────
router.get("/operational-expenses", async (req, res) => {
  const siteId = req.query.siteId ? parseInt(String(req.query.siteId), 10) : null;
  const tenantId = req.query.tenantId ? parseInt(String(req.query.tenantId), 10) : null;
  const category = String(req.query.category ?? "").trim() || null;
  const dateFrom = String(req.query.dateFrom ?? "").trim() || null;
  const dateTo = String(req.query.dateTo ?? "").trim() || null;
  const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? "20"), 10) || 20, 1), 100);
  const offset = Math.max(parseInt(String(req.query.offset ?? "0"), 10) || 0, 0);

  const ctxSiteId = (req as unknown as { siteId?: number }).siteId;

  try {
    const conditions: ReturnType<typeof eq>[] = [];
    if (ctxSiteId) conditions.push(eq(operationalExpensesTable.siteId, ctxSiteId));
    else if (siteId) conditions.push(eq(operationalExpensesTable.siteId, siteId));
    if (tenantId) conditions.push(eq(operationalExpensesTable.tenantId, tenantId));
    if (category) conditions.push(eq(operationalExpensesTable.category, category));
    if (dateFrom) conditions.push(gte(operationalExpensesTable.paidAt, new Date(dateFrom)));
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      conditions.push(lte(operationalExpensesTable.paidAt, to));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countRow] = await db
      .select({ total: sql<number>`count(*)::int`, totalAmount: sql<string>`coalesce(sum(amount),0)::text` })
      .from(operationalExpensesTable)
      .where(whereClause);

    const rows = await db
      .select({
        id: operationalExpensesTable.id,
        siteId: operationalExpensesTable.siteId,
        tenantId: operationalExpensesTable.tenantId,
        category: operationalExpensesTable.category,
        description: operationalExpensesTable.description,
        amount: operationalExpensesTable.amount,
        paymentMethod: operationalExpensesTable.paymentMethod,
        paidAt: operationalExpensesTable.paidAt,
        receiptUrl: operationalExpensesTable.receiptUrl,
        notes: operationalExpensesTable.notes,
        createdAt: operationalExpensesTable.createdAt,
        tenantName: tenantsTable.businessName,
        siteName: mallSitesTable.name,
      })
      .from(operationalExpensesTable)
      .leftJoin(tenantsTable, eq(operationalExpensesTable.tenantId, tenantsTable.id))
      .leftJoin(mallSitesTable, eq(operationalExpensesTable.siteId, mallSitesTable.id))
      .where(whereClause)
      .orderBy(desc(operationalExpensesTable.paidAt))
      .limit(limit)
      .offset(offset);

    res.json({
      success: true,
      data: rows,
      summary: {
        totalRecords: countRow?.total ?? 0,
        totalAmount: countRow?.totalAmount ?? "0",
      },
      pagination: {
        total: countRow?.total ?? 0,
        limit,
        offset,
        hasMore: offset + rows.length < (countRow?.total ?? 0),
      },
    });
  } catch (err) {
    console.error("[GET /operational-expenses]", err);
    res.status(500).json({ error: "Gagal mengambil data pengeluaran" });
  }
});

// ─── POST /api/operational-expenses ───────────────────────────────────────────
router.post("/operational-expenses", async (req, res) => {
  const parsed = expenseSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Data tidak valid", detail: parsed.error.issues });
    return;
  }

  const ctxSiteId = (req as unknown as { siteId?: number }).siteId;
  const rawUserId = (req as unknown as { user?: { id?: unknown } }).user?.id;
  const userId = rawUserId && !isNaN(Number(rawUserId)) ? Number(rawUserId) : null;
  const data = parsed.data;

  try {
    const [row] = await db
      .insert(operationalExpensesTable)
      .values({
        siteId: ctxSiteId ?? data.siteId ?? null,
        tenantId: data.tenantId ?? null,
        category: data.category,
        description: data.description ?? null,
        amount: String(data.amount),
        paymentMethod: data.paymentMethod,
        paidAt: data.paidAt ? new Date(data.paidAt) : new Date(),
        createdBy: userId,
        receiptUrl: data.receiptUrl ?? null,
        notes: data.notes ?? null,
      })
      .returning();

    logAudit(req, {
      action: "create_operational_expense",
      entityType: "operational_expenses",
      entityId: row.id,
      afterData: { ...data, id: row.id },
    });

    res.status(201).json({ success: true, data: row });
  } catch (err) {
    console.error("[POST /operational-expenses]", err);
    res.status(500).json({ error: "Gagal mencatat pengeluaran" });
  }
});

// ─── PATCH /api/operational-expenses/:id ──────────────────────────────────────
router.patch("/operational-expenses/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid" }); return; }

  const parsed = expenseSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Data tidak valid", detail: parsed.error.issues });
    return;
  }

  try {
    const [existing] = await db
      .select({ id: operationalExpensesTable.id })
      .from(operationalExpensesTable)
      .where(eq(operationalExpensesTable.id, id));

    if (!existing) { res.status(404).json({ error: "Pengeluaran tidak ditemukan" }); return; }

    const data = parsed.data;
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (data.category !== undefined) updateData.category = data.category;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.amount !== undefined) updateData.amount = String(data.amount);
    if (data.paymentMethod !== undefined) updateData.paymentMethod = data.paymentMethod;
    if (data.paidAt !== undefined) updateData.paidAt = data.paidAt ? new Date(data.paidAt) : null;
    if (data.receiptUrl !== undefined) updateData.receiptUrl = data.receiptUrl;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.tenantId !== undefined) updateData.tenantId = data.tenantId;
    if (data.siteId !== undefined) updateData.siteId = data.siteId;

    const [updated] = await db
      .update(operationalExpensesTable)
      .set(updateData)
      .where(eq(operationalExpensesTable.id, id))
      .returning();

    logAudit(req, {
      action: "update_operational_expense",
      entityType: "operational_expenses",
      entityId: id,
      afterData: updateData,
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    console.error("[PATCH /operational-expenses/:id]", err);
    res.status(500).json({ error: "Gagal mengupdate pengeluaran" });
  }
});

// ─── DELETE /api/operational-expenses/:id ─────────────────────────────────────
router.delete("/operational-expenses/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid" }); return; }

  try {
    const [existing] = await db
      .select({ id: operationalExpensesTable.id, amount: operationalExpensesTable.amount })
      .from(operationalExpensesTable)
      .where(eq(operationalExpensesTable.id, id));

    if (!existing) { res.status(404).json({ error: "Pengeluaran tidak ditemukan" }); return; }

    await db.delete(operationalExpensesTable).where(eq(operationalExpensesTable.id, id));

    logAudit(req, {
      action: "delete_operational_expense",
      entityType: "operational_expenses",
      entityId: id,
      beforeData: existing,
    });

    res.json({ success: true, message: "Pengeluaran berhasil dihapus" });
  } catch (err) {
    console.error("[DELETE /operational-expenses/:id]", err);
    res.status(500).json({ error: "Gagal menghapus pengeluaran" });
  }
});

export default router;
