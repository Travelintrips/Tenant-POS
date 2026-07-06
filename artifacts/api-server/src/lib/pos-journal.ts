import { db } from "@workspace/db";
import { accountingEntriesTable, accountingEntryLinesTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";

const COA_KAS        = { name: "Kas dan Bank" };
const COA_PENDAPATAN = { name: "Pendapatan Sewa" };
const COA_PPN        = { name: "Hutang PPN Keluaran" };

const PPN_RATE = 0.11;

/** Metode pembayaran yang dianggap "tunai" → debit ke Kas */
const CASH_METHODS = new Set(["tunai", "cash"]);

export interface PostPosJournalOptions {
  paymentId: number;
  tenantId: number;
  invoiceId?: number | null;
  invoiceNumber?: string | null;
  businessName?: string | null;
  amountPaid: number;
  paymentMethod: string;
  transactionDate: Date;
  kasirName?: string | null;
  siteId?: number | null;
  receiptNumber: string;
  journalPrefix?: string;
  sourceApp?: string;
  sourceModule?: string;
  companyId?: number | null;
}

async function resolveCompanyFromSite(siteId: number | null | undefined): Promise<number> {
  if (!siteId) return 1;
  try {
    const row = await db.execute<{ company_id: number }>(sql`
      SELECT c.id AS company_id
      FROM mall_sites ms
      JOIN companies c ON c.id = ms.company_id
      WHERE ms.id = ${siteId}
      LIMIT 1
    `);
    const id = (row as any).rows?.[0]?.company_id;
    return id ? Number(id) : 1;
  } catch {
    return 1;
  }
}

export interface PostPosJournalResult {
  journalId: string;
  alreadyPosted: boolean;
  netAmount: number;
  taxAmount: number;
}

export async function postPosPaymentJournal(
  opts: PostPosJournalOptions,
): Promise<PostPosJournalResult> {
  const prefix = opts.journalPrefix ?? "POS";
  const datePart = opts.transactionDate.toISOString().slice(0, 10).replace(/-/g, "");
  const correlationId = `${prefix}-${datePart}-${opts.paymentId}`;

  const taxAmount = Math.round((opts.amountPaid * PPN_RATE) / (1 + PPN_RATE));
  const netAmount = opts.amountPaid - taxAmount;

  const [existing] = await db
    .select({ id: accountingEntriesTable.id })
    .from(accountingEntriesTable)
    .where(eq(accountingEntriesTable.correlationId, correlationId))
    .limit(1);

  if (existing) {
    return { journalId: correlationId, alreadyPosted: true, netAmount, taxAmount };
  }

  const companyId = opts.companyId ?? await resolveCompanyFromSite(opts.siteId);
  const srcModule = opts.sourceModule ?? "pos_payment";
  const transactionDateStr = opts.transactionDate.toISOString().slice(0, 10);

  const description =
    `${prefix} Payment — ${opts.businessName ?? `Tenant #${opts.tenantId}`}` +
    (opts.invoiceNumber ? ` — ${opts.invoiceNumber}` : "") +
    ` — ${opts.receiptNumber}`;

  // Pilih journal berdasarkan metode bayar:
  // tunai/cash/qris → cash journal (Kas), transfer/edc/bank → bank journal (Bank)
  const CASH_METHODS = ["tunai", "cash", "qris"];
  const journalType = CASH_METHODS.includes((opts.paymentMethod ?? "").toLowerCase()) ? "cash" : "bank";

  const journalRow = await db.execute(
    sql`SELECT id, default_debit_account_id FROM accounting_journals WHERE company_id = ${companyId} AND type = ${journalType} LIMIT 1`
  // Tentukan tipe jurnal berdasarkan metode pembayaran:
  // tunai/cash → cash journal (Kas)
  // transfer/qris/edc/other → bank journal (Bank Mandiri)
  const isCash = CASH_METHODS.has(opts.paymentMethod);
  const journalType = isCash ? "cash" : "bank";

  // Lookup jurnal yang sesuai untuk company ini
  const journalRow = await db.execute(
    sql`SELECT id, default_debit_account_id FROM accounting_journals
        WHERE company_id = ${companyId} AND type = ${journalType}
        ORDER BY id LIMIT 1`
  );
  let journalDbId: number | null = (journalRow as any).rows?.[0]?.id != null
    ? Number((journalRow as any).rows[0].id)
    : null;
  let kasAccountId: number | null = (journalRow as any).rows?.[0]?.default_debit_account_id
    ? Number((journalRow as any).rows[0].default_debit_account_id)
    : null;

  // Fallback ke cash journal jika bank journal tidak ada
  if (journalDbId == null && journalType === "bank") {
    const { logger: log } = await import("./logger");
    log.warn(`[pos-journal] Tidak ada bank journal untuk company_id=${companyId} — fallback ke cash journal`);
    const fallbackRow = await db.execute(
      sql`SELECT id, default_debit_account_id FROM accounting_journals WHERE company_id = ${companyId} AND type = 'cash' LIMIT 1`
    );
    journalDbId = (fallbackRow as any).rows?.[0]?.id != null ? Number((fallbackRow as any).rows[0].id) : null;
    kasAccountId = (fallbackRow as any).rows?.[0]?.default_debit_account_id
      ? Number((fallbackRow as any).rows[0].default_debit_account_id)
      : null;
  }

  // Jika tidak ada journal sama sekali, skip accounting
  if (journalDbId == null) {
    const { logger: log } = await import("./logger");
    log.warn(`[pos-journal] Tidak ada journal (${journalType}) untuk company_id=${companyId} — skip accounting`);
  const debitAccountId: number | null = (journalRow as any).rows?.[0]?.default_debit_account_id
    ? Number((journalRow as any).rows[0].default_debit_account_id)
    : null;

  // Jika tidak ada jurnal yang sesuai, coba fallback ke cash journal
  let finalJournalDbId = journalDbId;
  let finalDebitAccountId = debitAccountId;

  if (finalJournalDbId == null && !isCash) {
    const { logger: log } = await import("./logger");
    log.warn(`[pos-journal] Tidak ada bank journal untuk company_id=${companyId}, fallback ke cash journal`);
    const cashRow = await db.execute(
      sql`SELECT id, default_debit_account_id FROM accounting_journals
          WHERE company_id = ${companyId} AND type = 'cash'
          ORDER BY id LIMIT 1`
    );
    finalJournalDbId = (cashRow as any).rows?.[0]?.id != null
      ? Number((cashRow as any).rows[0].id)
      : null;
    finalDebitAccountId = (cashRow as any).rows?.[0]?.default_debit_account_id
      ? Number((cashRow as any).rows[0].default_debit_account_id)
      : null;
  }

  if (finalJournalDbId == null) {
    const { logger: log } = await import("./logger");
    log.warn(`[pos-journal] Tidak ada journal untuk company_id=${companyId} — skip accounting`);
    return { journalId: correlationId, alreadyPosted: false, netAmount, taxAmount };
  }

  // Lookup COA Pendapatan Sewa: 4-1021-{code} (migration 0061), fallback 4-1025-%
  const pendapatanRow = await db.execute(sql`
    SELECT id FROM chart_of_accounts
    WHERE company_id = ${companyId}
      AND (code LIKE '4-1021-%' OR code LIKE '4-1025-%')
    ORDER BY CASE WHEN code LIKE '4-1021-%' THEN 0 ELSE 1 END, id
    LIMIT 1
  `);
  const pendapatanAccountId: number | null = (pendapatanRow as any).rows?.[0]?.id
    ? Number((pendapatanRow as any).rows[0].id)
    : null;

  // Lookup COA PPN Keluaran: 2-1020-{code}
  const ppnRow = await db.execute(sql`
    SELECT id FROM chart_of_accounts
    WHERE company_id = ${companyId} AND code LIKE '2-1020-%'
    LIMIT 1
  `);
  const ppnAccountId: number | null = (ppnRow as any).rows?.[0]?.id
    ? Number((ppnRow as any).rows[0].id)
    : null;

  const year = transactionDateStr.slice(0, 4);
  const maxRow = await db.execute<{ max_num: string | null }>(
    sql`SELECT MAX(entry_number) AS max_num FROM accounting_entries
        WHERE entry_number LIKE ${prefix + "/" + year + "/%"}`
  );
  const maxNum = (maxRow as any).rows?.[0]?.max_num as string | null;
  let nextSeq = 1;
  if (maxNum) {
    const parts = maxNum.split("/");
    const lastNum = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastNum)) nextSeq = lastNum + 1;
  }
  const entryNumber = `${prefix}/${year}/${String(nextSeq).padStart(4, "0")}`;

  const debitAccountName = isCash ? COA_KAS.name : "Bank";

  const entryResult = await db.execute(sql`
    INSERT INTO accounting_entries
      (entry_number, journal_id, date, ref, description, status,
       source, source_module, source_table, source_id,
       total_debit, total_credit, company_id, correlation_id, created_at)
    VALUES
      (${entryNumber}, ${finalJournalDbId}, ${transactionDateStr}::date,
       ${opts.receiptNumber}, ${description}, 'draft',
       ${"tenant_rent_payment"}::accounting_entry_source,
       ${srcModule}, ${"tenant_payments"}, ${opts.paymentId},
       ${opts.amountPaid}, ${opts.amountPaid},
       ${companyId}, ${correlationId}, NOW())
    RETURNING id
  `);
  const entryId = (entryResult as any).rows?.[0]?.id != null
    ? Number((entryResult as any).rows[0].id)
    : null;

  if (entryId) {
    const lineValues: Array<{ accountId: number; desc: string; debit: number; credit: number }> = [];
    if (finalDebitAccountId) lineValues.push({ accountId: finalDebitAccountId, desc: debitAccountName, debit: opts.amountPaid, credit: 0 });
    if (pendapatanAccountId) lineValues.push({ accountId: pendapatanAccountId, desc: COA_PENDAPATAN.name, debit: 0, credit: netAmount });
    if (ppnAccountId && taxAmount > 0) lineValues.push({ accountId: ppnAccountId, desc: COA_PPN.name, debit: 0, credit: taxAmount });

    if (lineValues.length > 0) {
      for (const l of lineValues) {
        await db.execute(sql`
          INSERT INTO accounting_entry_lines
            (entry_id, account_id, description, debit, credit, source_module, source_id, company_id)
          VALUES
            (${entryId}, ${l.accountId}, ${l.desc}, ${l.debit}, ${l.credit}, ${srcModule}, ${opts.paymentId}, ${companyId})
        `);
      }
    }
    await db.execute(sql`UPDATE accounting_entries SET status = 'posted' WHERE id = ${entryId}`);

    // Catat di accounting_payments (idempoten via correlation_id)
    const payCorrelationId = `pay-${correlationId}`;
    const paymentMethodMapped =
      opts.paymentMethod === "cash" || opts.paymentMethod === "tunai" ? "cash"
      : opts.paymentMethod === "qris" ? "qris"
      : "bank";
    const paidAtStr = opts.transactionDate.toISOString();
    try {
      await db.execute(sql`
        INSERT INTO accounting_payments
          (entry_id, company_id, source_module, source_table, source_id,
           payment_type, payment_method, amount, currency, paid_at, date,
           ref, description, correlation_id,
           journal_id, partner_name,
           created_at, updated_at)
        SELECT
          ${entryId}, ${companyId}, ${srcModule}, ${"tenant_payments"}, ${opts.paymentId},
          ${"inbound"}::accounting_payment_type, ${paymentMethodMapped}, ${opts.amountPaid}, ${"IDR"},
          ${paidAtStr}::timestamptz, ${transactionDateStr}::date,
          ${opts.receiptNumber}, ${description}, ${payCorrelationId},
          ${finalJournalDbId}, ${opts.businessName ?? null},
          NOW(), NOW()
        WHERE NOT EXISTS (
          SELECT 1 FROM accounting_payments WHERE correlation_id = ${payCorrelationId}
        )
      `);
    } catch (e) {
      const logger = (await import("./logger")).logger;
      logger.warn({ err: e }, "[pos-journal] accounting_payments INSERT gagal — non-fatal");
    }

    // Catat di tax_transactions (idempoten via correlation_id)
    if (taxAmount > 0) {
      const period = transactionDateStr.slice(0, 7);
      const taxCorrelationId = `ppn-${correlationId}`;
      try {
        await db.execute(sql`
          INSERT INTO tax_transactions
            (company_id, source_module, source_table, source_id,
             tax_type, tax_rate, taxable_amount, tax_amount,
             direction, period, status, correlation_id, ref, description,
             created_at, updated_at)
          VALUES
            (${companyId}, ${srcModule}, ${"tenant_payments"}, ${opts.paymentId},
             ${"ppn"}, ${PPN_RATE}, ${netAmount}, ${taxAmount},
             ${"out"}, ${period}, ${"posted"}, ${taxCorrelationId},
             ${entryNumber}, ${description},
             NOW(), NOW())
          ON CONFLICT (correlation_id) DO NOTHING
        `);
      } catch (e) {
        const logger = (await import("./logger")).logger;
        logger.warn({ err: e }, "[pos-journal] tax_transactions INSERT gagal — non-fatal");
      }
    }
  }

  return { journalId: correlationId, alreadyPosted: false, netAmount, taxAmount };
}
