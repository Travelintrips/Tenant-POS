import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { otherIncomeTable, tenantsTable, mallSitesTable, companiesTable } from "@workspace/db/schema";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import { z } from "zod";
import { logAudit } from "../lib/audit";

const router: IRouter = Router();

const VALID_CATEGORIES = ["penalty", "refund", "service", "other"] as const;

const incomeSchema = z.object({
  siteId: z.number().int().positive().optional().nullable(),
  tenantId: z.number().int().positive().optional().nullable(),
  category: z.enum(VALID_CATEGORIES).default("other"),
  coaCode: z.string().max(50).optional().nullable(),
  coaName: z.string().max(200).optional().nullable(),
  description: z.string().min(1, "Deskripsi wajib diisi").max(500),
  amount: z.number().positive("Nominal harus lebih dari 0"),
  date: z.string().datetime().optional().nullable(),
});

router.get("/other-income/coa-accounts", async (req, res) => {
  try {
    const rows = await db.execute<{
      id: number; company_id: number; code: string; name: string; account_type: string;
    }>(sql`
      SELECT DISTINCT ON (coa.code) coa.id, coa.company_id, coa.code, coa.name,
        COALESCE(coa.type::text, coa.account_type) AS account_type
      FROM chart_of_accounts coa
      WHERE coa.is_active = true
        AND COALESCE(coa.type::text, coa.account_type) IN ('income','revenue','pendapatan')
      ORDER BY coa.code, coa.id
    `);
    const accounts = (rows as unknown as { rows: Array<{ id: number; company_id: number; code: string; name: string; account_type: string }> }).rows ?? [];
    res.json({ success: true, data: accounts.map(a => ({ id: a.id, companyId: a.company_id, code: a.code, name: a.name, accountType: a.account_type })) });
  } catch (err) {
    console.error("[GET /other-income/coa-accounts]", err);
    res.status(500).json({ error: "Gagal mengambil daftar akun COA" });
  }
});

router.get("/other-income/summary", async (req, res) => {
  const ctxSiteId = (req as unknown as { siteId?: number }).siteId;
  const dateFrom = String(req.query.dateFrom ?? "").trim() || null;
  const dateTo = String(req.query.dateTo ?? "").trim() || null;
  try {
    const conditions: ReturnType<typeof eq>[] = [];
    if (ctxSiteId) conditions.push(eq(otherIncomeTable.siteId, ctxSiteId));
    if (dateFrom) conditions.push(gte(otherIncomeTable.date, new Date(dateFrom)));
    if (dateTo) { const to = new Date(dateTo); to.setHours(23,59,59,999); conditions.push(lte(otherIncomeTable.date, to)); }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const rows = await db.select({ category: otherIncomeTable.category, total: sql<string>`coalesce(sum(amount),0)::text`, count: sql<string>`count(*)::text` }).from(otherIncomeTable).where(whereClause).groupBy(otherIncomeTable.category);
    const grandTotal = rows.reduce((a, r) => a + Number(r.total), 0);
    const grandCount = rows.reduce((a, r) => a + Number(r.count), 0);
    res.json({ success: true, data: { totalAmount: grandTotal, totalCount: grandCount, byCategory: rows.map(r => ({ category: r.category, total: Number(r.total), count: Number(r.count) })) } });
  } catch (err) {
    console.error("[GET /other-income/summary]", err);
    res.status(500).json({ error: "Gagal mengambil ringkasan pemasukan" });
  }
});

router.get("/other-income", async (req, res) => {
  const tenantId = req.query.tenantId ? parseInt(String(req.query.tenantId), 10) : null;
  const companyId = req.query.companyId ? parseInt(String(req.query.companyId), 10) : null;
  const category = String(req.query.category ?? "").trim() || null;
  const dateFrom = String(req.query.dateFrom ?? "").trim() || null;
  const dateTo = String(req.query.dateTo ?? "").trim() || null;
  const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? "20"), 10) || 20, 1), 100);
  const offset = Math.max(parseInt(String(req.query.offset ?? "0"), 10) || 0, 0);
  const ctxSiteId = (req as unknown as { siteId?: number }).siteId;
  try {
    const conditions: ReturnType<typeof eq>[] = [];
    if (ctxSiteId) conditions.push(eq(otherIncomeTable.siteId, ctxSiteId));
    if (companyId && !isNaN(companyId)) conditions.push(eq(otherIncomeTable.companyId, companyId));
    if (tenantId) conditions.push(eq(otherIncomeTable.tenantId, tenantId));
    if (category && VALID_CATEGORIES.includes(category as typeof VALID_CATEGORIES[number])) conditions.push(eq(otherIncomeTable.category, category));
    if (dateFrom) conditions.push(gte(otherIncomeTable.date, new Date(dateFrom)));
    if (dateTo) { const to = new Date(dateTo); to.setHours(23,59,59,999); conditions.push(lte(otherIncomeTable.date, to)); }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const [countRow] = await db.select({ total: sql<number>`count(*)::int`, totalAmount: sql<string>`coalesce(sum(amount),0)::text` }).from(otherIncomeTable).where(whereClause);
    const rows = await db.select({
      id: otherIncomeTable.id,
      siteId: otherIncomeTable.siteId,
      companyId: otherIncomeTable.companyId,
      tenantId: otherIncomeTable.tenantId,
      category: otherIncomeTable.category,
      coaCode: otherIncomeTable.coaCode,
      coaName: otherIncomeTable.coaName,
      description: otherIncomeTable.description,
      amount: otherIncomeTable.amount,
      date: otherIncomeTable.date,
      createdAt: otherIncomeTable.createdAt,
      tenantName: tenantsTable.businessName,
      siteName: mallSitesTable.name,
      companyName: companiesTable.companyName,
    }).from(otherIncomeTable)
      .leftJoin(tenantsTable, eq(otherIncomeTable.tenantId, tenantsTable.id))
      .leftJoin(mallSitesTable, eq(otherIncomeTable.siteId, mallSitesTable.id))
      .leftJoin(companiesTable, eq(otherIncomeTable.companyId, companiesTable.id))
      .where(whereClause).orderBy(desc(otherIncomeTable.date)).limit(limit).offset(offset);
    res.json({ success: true, data: rows, summary: { totalRecords: countRow?.total ?? 0, totalAmount: countRow?.totalAmount ?? "0" }, pagination: { total: countRow?.total ?? 0, limit, offset, hasMore: offset + rows.length < (countRow?.total ?? 0) } });
  } catch (err) {
    console.error("[GET /other-income]", err);
    res.status(500).json({ error: "Gagal mengambil data pemasukan" });
  }
});

async function postIncomeJournal(opts: { incomeId: number; siteId: number | null; amount: number; description: string; date: Date; coaCode: string; coaName: string }): Promise<void> {
  try {
    const { incomeId, siteId, amount, description, date, coaCode, coaName } = opts;
    const companyRow = await db.execute<{ id: number }>(sql`SELECT c.id FROM companies c JOIN mall_sites ms ON ms.id = ${siteId} WHERE LOWER(c.company_name) LIKE LOWER(CONCAT('%', SPLIT_PART(ms.name, ' ', 1), '%')) OR c.id = 1 ORDER BY CASE WHEN LOWER(c.company_name) LIKE LOWER(CONCAT('%', SPLIT_PART(ms.name, ' ', 1), '%')) THEN 0 ELSE 1 END LIMIT 1`).catch(() => ({ rows: [] as { id: number }[] }));
    const companyId: number = (companyRow as unknown as { rows: { id: number }[] }).rows?.[0]?.id ?? 1;
    const journalRow = await db.execute<{ id: number }>(sql`SELECT id FROM accounting_journals WHERE company_id = ${companyId} ORDER BY id LIMIT 1`).catch(() => ({ rows: [] as { id: number }[] }));
    const journalId: number = (journalRow as unknown as { rows: { id: number }[] }).rows?.[0]?.id ?? 1;
    const dateStr = date.toISOString().slice(0, 10);
    const entryNumber = `INC-${dateStr.replace(/-/g, "")}-${incomeId}`;
    const correlationId = `income-${incomeId}`;
    const kasCoaRow = await db.execute<{ id: number }>(sql`SELECT id FROM chart_of_accounts WHERE company_id = ${companyId} AND code = '1-1001' LIMIT 1`).catch(() => ({ rows: [] as { id: number }[] }));
    const incomeCoaRow = await db.execute<{ id: number }>(sql`SELECT id FROM chart_of_accounts WHERE company_id = ${companyId} AND code = ${coaCode} LIMIT 1`).catch(() => ({ rows: [] as { id: number }[] }));
    const debitAccountId: number | null = (kasCoaRow as unknown as { rows: { id: number }[] }).rows?.[0]?.id ?? null;
    const creditAccountId: number | null = (incomeCoaRow as unknown as { rows: { id: number }[] }).rows?.[0]?.id ?? null;
    const entryRow = await db.execute<{ id: number }>(sql`INSERT INTO accounting_entries (entry_number, journal_id, date, description, status, source, source_id, total_debit, total_credit, company_id, correlation_id, created_at) VALUES (${entryNumber}, ${journalId}, ${dateStr}::date, ${description || `Pemasukan #${incomeId}`}, 'posted', 'other_income'::accounting_entry_source, ${incomeId}, ${amount}, ${amount}, ${companyId}, ${correlationId}, NOW()) ON CONFLICT (correlation_id) DO NOTHING RETURNING id`).catch(() => ({ rows: [] as { id: number }[] }));
    const entryId: number | null = (entryRow as unknown as { rows: { id: number }[] }).rows?.[0]?.id ?? null;
    if (!entryId) return;
    await db.execute(sql`INSERT INTO accounting_entry_lines (entry_id, account_id, description, debit, credit, created_at) VALUES (${entryId}, ${debitAccountId}, 'Kas dan Bank', ${amount}, 0, NOW()), (${entryId}, ${creditAccountId}, ${coaName}, 0, ${amount}, NOW())`).catch((e) => console.warn("[postIncomeJournal] lines failed:", e));
  } catch (err) {
    console.warn("[postIncomeJournal] Jurnal tidak terposting:", err);
  }
}

router.post("/other-income", async (req, res) => {
  const parsed = incomeSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Data tidak valid", detail: parsed.error.issues }); return; }
  const ctxSiteId = (req as unknown as { siteId?: number }).siteId;
  const rawUserId = (req as unknown as { user?: { id?: unknown } }).user?.id;
  const userId = rawUserId ? String(rawUserId) : null;
  const data = parsed.data;
  const effectiveSiteId = ctxSiteId ?? data.siteId ?? null;
  try {
    // Resolve company_id dari site_id via kolom company_id di mall_sites
    let resolvedCompanyId: number | null = null;
    if (effectiveSiteId) {
      const companyRow = await db.execute<{ company_id: number }>(sql`
        SELECT company_id FROM mall_sites WHERE id = ${effectiveSiteId} LIMIT 1
      `).catch(() => ({ rows: [] as { company_id: number }[] }));
      resolvedCompanyId = (companyRow as unknown as { rows: { company_id: number }[] }).rows?.[0]?.company_id ?? null;
    }
    const [row] = await db.insert(otherIncomeTable).values({ siteId: effectiveSiteId, companyId: resolvedCompanyId, tenantId: data.tenantId ?? null, category: data.category, coaCode: data.coaCode ?? null, coaName: data.coaName ?? null, description: data.description, amount: String(data.amount), date: data.date ? new Date(data.date) : new Date(), createdBy: userId }).returning();
    logAudit(req, { action: "create_other_income", entityType: "other_income", entityId: row.id, afterData: { ...data, id: row.id } });
    if (data.coaCode && data.coaName) { void postIncomeJournal({ incomeId: row.id, siteId: effectiveSiteId, amount: data.amount, description: data.description, date: row.date ?? new Date(), coaCode: data.coaCode, coaName: data.coaName }); }
    res.status(201).json({ success: true, data: row });
  } catch (err) {
    console.error("[POST /other-income]", err);
    res.status(500).json({ error: "Gagal mencatat pemasukan" });
  }
});

router.delete("/other-income/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid" }); return; }
  try {
    const [existing] = await db.select({ id: otherIncomeTable.id }).from(otherIncomeTable).where(eq(otherIncomeTable.id, id));
    if (!existing) { res.status(404).json({ error: "Data tidak ditemukan" }); return; }
    await db.delete(otherIncomeTable).where(eq(otherIncomeTable.id, id));
    logAudit(req, { action: "delete_other_income", entityType: "other_income", entityId: id, beforeData: existing });
    res.json({ success: true, message: "Pemasukan berhasil dihapus" });
  } catch (err) {
    console.error("[DELETE /other-income/:id]", err);
    res.status(500).json({ error: "Gagal menghapus pemasukan" });
  }
});

export default router;
