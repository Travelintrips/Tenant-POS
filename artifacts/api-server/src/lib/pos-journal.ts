import { db } from "@workspace/db";
import { accountingEntriesTable, accountingEntryLinesTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";

const COA_KAS        = { name: "Kas dan Bank" };
const COA_PENDAPATAN = { name: "Pendapatan Sewa" };
const COA_PPN        = { name: "Hutang PPN Keluaran" };

const PPN_RATE = 0.11;

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
      JOIN companies c
        ON UPPER(TRIM(c.name))         = UPPER(TRIM(ms.company_name))
        OR UPPER(TRIM(c.company_name)) = UPPER(TRIM(ms.company_name))
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

  // Lookup journal kas untuk company ini (+ default_debit_account_id untuk Kas)
  const journalRow = await db.execute(
    sql`SELECT id, default_debit_account_id FROM accounting_journals WHERE company_id = ${companyId} AND type = 'cash' LIMIT 1`
  );
  const journalDbId = (journalRow as any).rows?.[0]?.id
    ? Number((journalRow as any).rows[0].id)
    : 1;
  const kasAccountId: number | null = (journalRow as any).rows?.[0]?.default_debit_account_id
    ? Number((journalRow as any).rows[0].default_debit_account_id)
    : null;

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
        WHERE journal_id = ${journalDbId} AND entry_number LIKE ${prefix + "/" + year + "/%"}`
  );
  const maxNum = (maxRow as any).rows?.[0]?.max_num as string | null;
  let nextSeq = 1;
  if (maxNum) {
    const parts = maxNum.split("/");
    const lastNum = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastNum)) nextSeq = lastNum + 1;
  }
  const entryNumber = `${prefix}/${year}/${String(nextSeq).padStart(4, "0")}`;

  const entryResult = await db.execute(sql`
    INSERT INTO accounting_entries
      (entry_number, journal_id, date, ref, description, status,
       source, source_module, source_table, source_id,
       total_debit, total_credit, company_id, correlation_id, created_at)
    VALUES
      (${entryNumber}, ${journalDbId}, ${transactionDateStr}::date,
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
    // account_id wajib NOT NULL — gunakan hasil lookup; jika null pakai 0 (invalid tapi tidak crash)
    const kasId    = kasAccountId    ?? 0;
    const pendId   = pendapatanAccountId ?? 0;
    const ppnId    = ppnAccountId    ?? 0;

    await db.execute(sql`
      INSERT INTO accounting_entry_lines
        (entry_id, account_id, description, debit, credit, source_module, source_id, company_id)
      VALUES
        (${entryId}, ${kasId},  ${COA_KAS.name},        ${opts.amountPaid}, 0,           ${srcModule}, ${opts.paymentId}, ${companyId}),
        (${entryId}, ${pendId}, ${COA_PENDAPATAN.name}, 0,                  ${netAmount}, ${srcModule}, ${opts.paymentId}, ${companyId}),
        (${entryId}, ${ppnId},  ${COA_PPN.name},        0,                  ${taxAmount}, ${srcModule}, ${opts.paymentId}, ${companyId})
    `);
    await db.execute(sql`UPDATE accounting_entries SET status = 'posted' WHERE id = ${entryId}`);

    // Catat di accounting_payments (idempoten via correlation_id)
    const payCorrelationId = `pay-${correlationId}`;
    const paymentMethodMapped =
      opts.paymentMethod === "cash" ? "cash"
      : opts.paymentMethod === "qris" ? "qris"
      : "bank";
    const paidAtStr = opts.transactionDate.toISOString();
    // Gunakan WHERE NOT EXISTS agar idempoten meski kolom correlation_id baru ditambahkan
    await db.execute(sql`
      INSERT INTO accounting_payments
        (entry_id, company_id, source_module, source_table, source_id,
         payment_method, amount, currency, paid_at,
         ref, description, correlation_id,
         journal_id, partner_name,
         created_at, updated_at)
      SELECT
        ${entryId}, ${companyId}, ${srcModule}, ${"tenant_payments"}, ${opts.paymentId},
        ${paymentMethodMapped}, ${opts.amountPaid}, ${"IDR"}, ${paidAtStr}::timestamptz,
        ${opts.receiptNumber}, ${description}, ${payCorrelationId},
        ${journalDbId}, ${opts.businessName ?? null},
        NOW(), NOW()
      WHERE NOT EXISTS (
        SELECT 1 FROM accounting_payments WHERE correlation_id = ${payCorrelationId}
      )
    `);

    // Catat di tax_transactions (idempoten via correlation_id)
    if (taxAmount > 0) {
      const period = transactionDateStr.slice(0, 7); // "YYYY-MM"
      const taxCorrelationId = `ppn-${correlationId}`;
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
    }
  }

  return { journalId: correlationId, alreadyPosted: false, netAmount, taxAmount };
}
