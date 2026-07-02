import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { operationalExpensesTable, tenantsTable, mallSitesTable, companiesTable } from "@workspace/db/schema";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import { z } from "zod";
import { logAudit } from "../lib/audit";
import { requireAnyRole } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const VALID_METHODS = ["cash", "transfer", "e-wallet", "lainnya"] as const;

const expenseSchema = z.object({
  siteId: z.number().int().positive().optional().nullable(),
  tenantId: z.number().int().positive().optional().nullable(),
  category: z.string().max(100).optional().nullable(),
  coaCode: z.string().max(50).optional().nullable(),
  coaName: z.string().max(200).optional().nullable(),
  coaAccountType: z.string().max(50).optional().nullable(),
  description: z.string().max(500).optional().nullable(),
  amount: z.number().positive("Nominal harus lebih dari 0"),
  paymentMethod: z.enum(VALID_METHODS).default("cash"),
  paidAt: z.string().datetime().optional().nullable(),
  receiptUrl: z.string().url().optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

// ─── GET /api/operational-expenses/coa-accounts ───────────────────────────────
router.get("/operational-expenses/coa-accounts", async (req, res) => {
  const ctxSiteId = (req as unknown as { siteId?: number }).siteId;
  try {
    // Resolve company_id dari site aktif
    let companyId: number | null = null;
    if (ctxSiteId) {
      const siteRow = await db.execute<{ company_id: number }>(sql`
        SELECT company_id FROM mall_sites WHERE id = ${ctxSiteId} LIMIT 1
      `).catch(() => ({ rows: [] as { company_id: number }[] }));
      companyId = (siteRow as unknown as { rows: { company_id: number }[] }).rows?.[0]?.company_id ?? null;
    }

    // Query COA: prioritaskan company_id site aktif, fallback ke semua company
    const rows = await db.execute<{
      id: number;
      company_id: number;
      code: string;
      name: string;
      account_type: string;
    }>(sql`
      SELECT
        coa.id,
        coa.company_id,
        coa.code,
        coa.name,
        coa.account_type
      FROM chart_of_accounts coa
      WHERE coa.is_active = true
        AND coa.account_type IN (
          'expense', 'biaya',
          'asset', 'aset',
          'liability', 'kewajiban',
          'other'
        )
        ${companyId ? sql`AND coa.company_id = ${companyId}` : sql``}
      ORDER BY coa.account_type, coa.code
    `);

    let accounts = (rows as unknown as { rows: Array<{ id: number; company_id: number; code: string; name: string; account_type: string }> }).rows ?? [];

    // Fallback: jika company tidak punya COA sendiri, ambil dari company_id=1 (default)
    if (accounts.length === 0 && companyId && companyId !== 1) {
      const fallbackRows = await db.execute<{
        id: number;
        company_id: number;
        code: string;
        name: string;
        account_type: string;
      }>(sql`
        SELECT coa.id, coa.company_id, coa.code, coa.name, coa.account_type
        FROM chart_of_accounts coa
        WHERE coa.is_active = true
          AND coa.account_type IN ('expense','biaya','asset','aset','liability','kewajiban','other')
          AND coa.company_id = 1
        ORDER BY coa.account_type, coa.code
      `);
      accounts = (fallbackRows as unknown as { rows: typeof accounts }).rows ?? [];
    }

    const normalize = (t: string) => {
      if (t === 'biaya') return 'expense';
      if (t === 'aset') return 'asset';
      if (t === 'kewajiban') return 'liability';
      return t;
    };

    const result = accounts.map(a => ({
      id: a.id,
      companyId: a.company_id,
      code: a.code,
      name: a.name,
      accountType: normalize(a.account_type),
    }));

    res.json({ success: true, data: result });
  } catch (err) {
    logger.error({ err: err }, "[GET /operational-expenses/coa-accounts]");
    res.status(500).json({ error: "Gagal mengambil daftar akun COA" });
  }
});

// ─── GET /api/operational-expenses/monthly-summary ────────────────────────────
router.get("/operational-expenses/monthly-summary", async (req, res) => {
  const year = parseInt(String(req.query.year ?? new Date().getFullYear()), 10);
  const ctxSiteId = (req as unknown as { siteId?: number }).siteId;

  try {
    const rows = await db.execute(sql`
      SELECT
        TO_CHAR(paid_at, 'YYYY-MM') AS month_key,
        TO_CHAR(paid_at, 'Mon YY')  AS month_label,
        COALESCE(coa_account_type, 'expense') AS account_type,
        COALESCE(coa_name, category)           AS display_cat,
        COALESCE(SUM(amount), 0)::bigint       AS total
      FROM operational_expenses
      WHERE EXTRACT(YEAR FROM paid_at) = ${year}
        ${ctxSiteId ? sql`AND site_id = ${ctxSiteId}` : sql``}
      GROUP BY month_key, month_label, account_type, display_cat
      ORDER BY month_key
    `);

    type MonthRow = { month_key: string; month_label: string; account_type: string; display_cat: string; total: string };

    const map = new Map<string, { label: string; expense: number; asset: number; liability: number; other: number }>();

    for (const r of (rows as unknown as { rows: MonthRow[] }).rows) {
      if (!map.has(r.month_key)) {
        map.set(r.month_key, { label: r.month_label, expense: 0, asset: 0, liability: 0, other: 0 });
      }
      const entry = map.get(r.month_key)!;
      const t = r.account_type === 'biaya' ? 'expense'
        : r.account_type === 'aset' ? 'asset'
        : r.account_type === 'kewajiban' ? 'liability'
        : r.account_type in entry ? r.account_type : 'other';
      (entry as unknown as Record<string, number>)[t] = ((entry as unknown as Record<string, number>)[t] ?? 0) + Number(r.total);
    }

    const months = [];
    for (let m = 1; m <= 12; m++) {
      const key = `${year}-${String(m).padStart(2, "0")}`;
      const label = new Date(year, m - 1, 1).toLocaleDateString("id-ID", { month: "short" });
      const entry = map.get(key) ?? { label, expense: 0, asset: 0, liability: 0, other: 0 };
      const total = entry.expense + entry.asset + entry.liability + entry.other;
      months.push({ month: label, expense: entry.expense, asset: entry.asset, liability: entry.liability, other: entry.other, total });
    }

    const categoryTotals = months.reduce(
      (acc, m) => ({
        expense: acc.expense + m.expense,
        asset: acc.asset + m.asset,
        liability: acc.liability + m.liability,
        other: acc.other + m.other,
      }),
      { expense: 0, asset: 0, liability: 0, other: 0 },
    );

    res.json({ success: true, year, months, categoryTotals });
  } catch (err) {
    logger.error({ err: err }, "[GET /operational-expenses/monthly-summary]");
    res.status(500).json({ error: "Gagal mengambil ringkasan bulanan" });
  }
});

// ─── GET /api/operational-expenses ────────────────────────────────────────────
router.get("/operational-expenses", async (req, res) => {
  const siteId = req.query.siteId ? parseInt(String(req.query.siteId), 10) : null;
  const companyId = req.query.companyId ? parseInt(String(req.query.companyId), 10) : null;
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
    if (companyId && !isNaN(companyId)) conditions.push(eq(operationalExpensesTable.companyId, companyId));
    if (tenantId) conditions.push(eq(operationalExpensesTable.tenantId, tenantId));
    if (category && ["expense","asset","liability","other"].includes(category)) {
      conditions.push(eq(operationalExpensesTable.coaAccountType, category));
    } else if (category) {
      conditions.push(eq(operationalExpensesTable.category, category));
    }
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
        companyId: operationalExpensesTable.companyId,
        tenantId: operationalExpensesTable.tenantId,
        category: operationalExpensesTable.category,
        coaCode: operationalExpensesTable.coaCode,
        coaName: operationalExpensesTable.coaName,
        coaAccountType: operationalExpensesTable.coaAccountType,
        description: operationalExpensesTable.description,
        amount: operationalExpensesTable.amount,
        paymentMethod: operationalExpensesTable.paymentMethod,
        paidAt: operationalExpensesTable.paidAt,
        receiptUrl: operationalExpensesTable.receiptUrl,
        notes: operationalExpensesTable.notes,
        createdAt: operationalExpensesTable.createdAt,
        tenantName: tenantsTable.businessName,
        siteName: mallSitesTable.name,
        companyName: companiesTable.companyName,
      })
      .from(operationalExpensesTable)
      .leftJoin(tenantsTable, eq(operationalExpensesTable.tenantId, tenantsTable.id))
      .leftJoin(mallSitesTable, eq(operationalExpensesTable.siteId, mallSitesTable.id))
      .leftJoin(companiesTable, eq(operationalExpensesTable.companyId, companiesTable.id))
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
    logger.error({ err: err }, "[GET /operational-expenses]");
    res.status(500).json({ error: "Gagal mengambil data pengeluaran" });
  }
});

// ─── Helper: derive category string from COA account type ─────────────────────
function deriveCategoryFromCoa(coaCode: string | null | undefined, coaAccountType: string | null | undefined, coaName: string | null | undefined): string {
  if (!coaCode) return "lain-lain";
  const t = coaAccountType ?? "";
  if (t === "asset" || t === "aset") return "kasbon";
  if (t === "liability" || t === "kewajiban") return "hutang";
  const code = coaCode.toLowerCase();
  if (code === "6101") return "listrik";
  if (code === "6102") return "internet";
  if (code === "6103") return "perbaikan";
  return "lain-lain";
}

// ─── Helper: post journal entry for expense ────────────────────────────────────
async function postExpenseJournal(opts: {
  expenseId: number;
  siteId: number | null;
  amount: number;
  description: string;
  paidAt: Date;
  coaCode: string;
  coaName: string;
  coaAccountType: string;
}): Promise<void> {
  try {
    const { expenseId, siteId, amount, description, paidAt, coaCode, coaName, coaAccountType } = opts;

    // Gunakan company_id langsung dari mall_sites (bukan name matching yang tidak akurat)
    const companyRow = await db.execute<{ id: number }>(sql`
      SELECT company_id AS id FROM mall_sites WHERE id = ${siteId} AND company_id IS NOT NULL LIMIT 1
    `).catch(() => ({ rows: [] as { id: number }[] }));

    const companyId: number = (companyRow as unknown as { rows: { id: number }[] }).rows?.[0]?.id ?? 1;

    const journalRow = await db.execute<{ id: number }>(sql`
      SELECT id FROM accounting_journals WHERE company_id = ${companyId} ORDER BY id LIMIT 1
    `).catch(() => ({ rows: [] as { id: number }[] }));

    const journalId: number = (journalRow as unknown as { rows: { id: number }[] }).rows?.[0]?.id ?? 1;

    const dateStr = paidAt.toISOString().slice(0, 10);
    const entryNumber = `EXP-${dateStr.replace(/-/g, "")}-${expenseId}`;
    const correlationId = `expense-${expenseId}`;

    const isAsset = coaAccountType === "asset" || coaAccountType === "aset";
    const isLiability = coaAccountType === "liability" || coaAccountType === "kewajiban";

    let debitCode = coaCode;
    let debitName = coaName;
    let creditCode = "1-1001";
    let creditName = "Kas dan Bank";

    if (isLiability) {
      debitCode = "6104";
      debitName = "Biaya Operasional Lainnya";
      creditCode = coaCode;
      creditName = coaName;
    }

    const expenseCoaRow = await db.execute<{ id: number }>(sql`
      SELECT id FROM chart_of_accounts WHERE company_id = ${companyId} AND code = ${debitCode} LIMIT 1
    `).catch(() => ({ rows: [] as { id: number }[] }));

    const kasCoaRow = await db.execute<{ id: number }>(sql`
      SELECT id FROM chart_of_accounts WHERE company_id = ${companyId} AND code = ${creditCode} LIMIT 1
    `).catch(() => ({ rows: [] as { id: number }[] }));

    const debitAccountId: number | null = (expenseCoaRow as unknown as { rows: { id: number }[] }).rows?.[0]?.id ?? null;
    const creditAccountId: number | null = (kasCoaRow as unknown as { rows: { id: number }[] }).rows?.[0]?.id ?? null;

    const entryRow = await db.execute<{ id: number }>(sql`
      INSERT INTO accounting_entries
        (entry_number, journal_id, date, description, status, source, source_id, total_debit, total_credit, company_id, correlation_id, created_at)
      VALUES
        (${entryNumber}, ${journalId}, ${dateStr}::date, ${description || `Pengeluaran #${expenseId}`},
         'posted', 'operational_expense', ${expenseId}, ${amount}, ${amount}, ${companyId}, ${correlationId}, NOW())
      ON CONFLICT (correlation_id) DO NOTHING
      RETURNING id
    `).catch(() => ({ rows: [] as { id: number }[] }));

    const entryId: number | null = (entryRow as unknown as { rows: { id: number }[] }).rows?.[0]?.id ?? null;
    if (!entryId) return;

    await db.execute(sql`
      INSERT INTO accounting_entry_lines (entry_id, account_id, description, debit, credit, created_at)
      VALUES
        (${entryId}, ${debitAccountId}, ${debitName}, ${amount}, 0, NOW()),
        (${entryId}, ${creditAccountId}, ${creditName}, 0, ${amount}, NOW())
    `).catch((e) => logger.warn({ e }, "[postExpenseJournal] entry lines failed:"));

  } catch (err) {
    logger.warn({ err: err }, "[postExpenseJournal] Jurnal tidak terposting:");
  }
}

// ─── POST /api/operational-expenses ───────────────────────────────────────────
router.post("/operational-expenses", requireAnyRole("owner", "admin", "finance"), async (req, res) => {
  const parsed = expenseSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Data tidak valid", detail: parsed.error.issues });
    return;
  }

  const ctxSiteId = (req as unknown as { siteId?: number }).siteId;
  const rawUserId = (req as unknown as { user?: { id?: unknown } }).user?.id;
  const userId = rawUserId && !isNaN(Number(rawUserId)) ? Number(rawUserId) : null;
  const data = parsed.data;

  const effectiveSiteId = ctxSiteId ?? data.siteId ?? null;
  const coaCode = data.coaCode ?? null;
  const coaName = data.coaName ?? null;
  const coaAccountType = data.coaAccountType ?? null;
  const derivedCategory = data.category ?? deriveCategoryFromCoa(coaCode, coaAccountType, coaName);

  try {
    // Resolve company_id dari site_id via kolom company_id di mall_sites
    let resolvedCompanyId: number | null = null;
    if (effectiveSiteId) {
      const companyRow = await db.execute<{ company_id: number }>(sql`
        SELECT company_id FROM mall_sites WHERE id = ${effectiveSiteId} LIMIT 1
      `).catch(() => ({ rows: [] as { company_id: number }[] }));
      resolvedCompanyId = (companyRow as unknown as { rows: { company_id: number }[] }).rows?.[0]?.company_id ?? null;
    }

    const [row] = await db
      .insert(operationalExpensesTable)
      .values({
        siteId: effectiveSiteId,
        companyId: resolvedCompanyId,
        tenantId: data.tenantId ?? null,
        category: derivedCategory,
        coaCode,
        coaName,
        coaAccountType,
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

    if (coaCode && coaName && coaAccountType) {
      void postExpenseJournal({
        expenseId: row.id,
        siteId: effectiveSiteId,
        amount: data.amount,
        description: data.description ?? "",
        paidAt: row.paidAt ?? new Date(),
        coaCode,
        coaName,
        coaAccountType,
      });
    }

    res.status(201).json({ success: true, data: row });
  } catch (err) {
    logger.error({ err: err }, "[POST /operational-expenses]");
    res.status(500).json({ error: "Gagal mencatat pengeluaran" });
  }
});

// ─── PATCH /api/operational-expenses/:id ──────────────────────────────────────
router.patch("/operational-expenses/:id", requireAnyRole("owner", "admin", "finance"), async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
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
    const updateData: Record<string, unknown> = { updatedAt: new Date() };

    if (data.coaCode !== undefined) updateData.coaCode = data.coaCode;
    if (data.coaName !== undefined) updateData.coaName = data.coaName;
    if (data.coaAccountType !== undefined) updateData.coaAccountType = data.coaAccountType;

    if (data.coaCode !== undefined || data.category !== undefined) {
      updateData.category = data.category ?? deriveCategoryFromCoa(data.coaCode ?? null, data.coaAccountType ?? null, data.coaName ?? null);
    }
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
    logger.error({ err: err }, "[PATCH /operational-expenses/:id]");
    res.status(500).json({ error: "Gagal mengupdate pengeluaran" });
  }
});

// ─── DELETE /api/operational-expenses/:id ─────────────────────────────────────
router.delete("/operational-expenses/:id", requireAnyRole("owner", "admin", "finance"), async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
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
    logger.error({ err: err }, "[DELETE /operational-expenses/:id]");
    res.status(500).json({ error: "Gagal menghapus pengeluaran" });
  }
});

export default router;
