import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

interface AccountingEntryParams {
  paymentId: number;
  siteId: number | null;
  invoiceNumber?: string | null;
  businessName?: string | null;
  amountPaid: number;
  paymentMethod: string;
  transactionDate: Date;
  receiptNumber?: string | null;
  sourceModule?: string;
}

/**
 * Posting pembayaran sewa tenant ke accounting_entries + accounting_entry_lines + accounting_payments.
 * Idempotent via correlation_id = "tenant_payment_{paymentId}" ATAU via unique index (source, source_id).
 * Pilih journal: tunai/qris → CSH, transfer/edc → BNK.
 * Company di-lookup dari mall_sites.company_name → companies.name.
 */
export async function postTenantPaymentAccountingEntry(
  params: AccountingEntryParams
): Promise<void> {
  const {
    paymentId,
    siteId,
    invoiceNumber,
    businessName,
    amountPaid,
    paymentMethod,
    transactionDate,
    receiptNumber,
    sourceModule = "direct_invoice_payment",
  } = params;

  const correlationId = `tenant_payment_${paymentId}`;

  try {
    // --- Idempotency check ---
    // Cek via correlation_id ATAU via unique index (source, source_id)
    // Ini menangani kasus pos-journal.ts sudah membuat entry dengan correlation_id berbeda
    const existing = await db.execute(sql`
      SELECT id FROM accounting_entries
      WHERE correlation_id = ${correlationId}
         OR (source = 'tenant_rent_payment'::accounting_entry_source
             AND source_id IS NOT NULL
             AND source_id = ${paymentId})
      LIMIT 1
    `);
    if ((existing as any).rows?.length > 0) {
      logger.info(`[accounting_entry] Entry sudah ada untuk payment_id=${paymentId} — dilewati`);
      return;
    }

    // --- Lookup company via site ---
    let companyId = 1;
    let companyCode = "CST";

    if (siteId) {
      const siteRow = await db.execute(sql`
        SELECT c.id AS company_id, c.code AS company_code
        FROM mall_sites ms
        JOIN companies c
          ON UPPER(TRIM(c.name)) = UPPER(TRIM(ms.company_name))
         OR UPPER(TRIM(c.company_name)) = UPPER(TRIM(ms.company_name))
        WHERE ms.id = ${siteId}
        LIMIT 1
      `);
      const row = (siteRow as any).rows?.[0];
      if (row?.company_id) {
        companyId = Number(row.company_id);
        companyCode = String(row.company_code ?? "CST");
      }
    }

    // --- Pilih journal berdasarkan payment method ---
    const CASH_METHODS = ["tunai", "cash", "qris"];
    const journalType = CASH_METHODS.includes((paymentMethod ?? "").toLowerCase())
      ? "cash"
      : "bank";

    const journalRow = await db.execute(sql`
      SELECT id, code, default_debit_account_id
      FROM accounting_journals
      WHERE company_id = ${companyId} AND type = ${journalType}
      LIMIT 1
    `);
    const journal = (journalRow as any).rows?.[0];
    if (!journal) {
      logger.warn(
        `[accounting_entry] Tidak ada journal type="${journalType}" untuk company_id=${companyId}`
      );
      return;
    }

    const journalId: number = Number(journal.id);
    const journalCode: string = String(journal.code);
    const debitAccountId: number = Number(journal.default_debit_account_id);

    // --- Lookup credit account: 4-1021-{code} (Pendapatan Sewa Tenant) ---
    const coaRow = await db.execute(sql`
      SELECT id, code FROM chart_of_accounts
      WHERE company_id = ${companyId}
        AND (code LIKE '4-1021-%' OR code LIKE '4-1025-%')
      ORDER BY
        CASE WHEN code LIKE '4-1021-%' THEN 0 ELSE 1 END,
        id
      LIMIT 1
    `);
    const creditAccountId: number | null =
      (coaRow as any).rows?.[0]?.id != null
        ? Number((coaRow as any).rows[0].id)
        : null;

    if (!creditAccountId) {
      logger.warn(
        `[accounting_entry] COA pendapatan sewa (4-1021-* / 4-1025-*) tidak ditemukan untuk company_id=${companyId}, skip`
      );
      return;
    }

    // --- Generate entry_number sequential ---
    const year = transactionDate.getFullYear();
    const journalPrefix = journalCode;
    const likePattern = `${journalPrefix}/${year}/%`;

    const maxRow = await db.execute(sql`
      SELECT MAX(entry_number) AS max_num
      FROM accounting_entries
      WHERE journal_id = ${journalId}
        AND entry_number LIKE ${likePattern}
    `);
    const maxNum = (maxRow as any).rows?.[0]?.max_num as string | null;
    let nextSeq = 1;
    if (maxNum) {
      const parts = maxNum.split("/");
      const lastNum = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastNum)) nextSeq = lastNum + 1;
    }
    const entryNumber = `${journalPrefix}/${year}/${String(nextSeq).padStart(4, "0")}`;

    // --- Insert accounting_entries ---
    const ref = receiptNumber ?? invoiceNumber ?? `ID-${paymentId}`;
    const description = `Pembayaran Sewa Tenant (${ref})`;
    const dateStr = transactionDate.toISOString().split("T")[0];

    const entryResult = await db.execute(sql`
      INSERT INTO accounting_entries
        (entry_number, journal_id, date, ref, description, status,
         source, source_module, source_id, total_debit, total_credit,
         company_id, correlation_id, created_at)
      VALUES
        (${entryNumber}, ${journalId}, ${dateStr}::date, ${ref},
         ${description}, 'draft',
         ${"tenant_rent_payment"}::accounting_entry_source,
         ${sourceModule}, ${paymentId}, ${amountPaid}, ${amountPaid},
         ${companyId}, ${correlationId}, NOW())
      ON CONFLICT DO NOTHING
      RETURNING id
    `);
    let entryId: number | null =
      (entryResult as any).rows?.[0]?.id != null
        ? Number((entryResult as any).rows[0].id)
        : null;

    // Jika ON CONFLICT DO NOTHING → ambil id yang sudah ada
    if (!entryId) {
      const existing2 = await db.execute(sql`
        SELECT id FROM accounting_entries
        WHERE source = 'tenant_rent_payment'::accounting_entry_source AND source_id = ${paymentId}
        LIMIT 1
      `);
      entryId = (existing2 as any).rows?.[0]?.id != null
        ? Number((existing2 as any).rows[0].id)
        : null;
    }

    if (!entryId) {
      logger.warn("[accounting_entry] Insert accounting_entries gagal (tidak ada RETURNING id)");
      return;
    }

    // --- Insert accounting_entry_lines (debit + credit) ---
    const bizLabel = businessName ?? "Tenant";
    try {
      await db.execute(sql`
        INSERT INTO accounting_entry_lines (entry_id, account_id, description, debit, credit)
        VALUES
          (${entryId}, ${debitAccountId},
           ${"Penerimaan sewa " + ref},
           ${amountPaid}, 0),
          (${entryId}, ${creditAccountId},
           ${"Pendapatan Sewa Tenant — " + bizLabel},
           0, ${amountPaid})
        ON CONFLICT DO NOTHING
      `);
    } catch {
      // Lines mungkin sudah ada jika entry di-recover dari conflict
    }

    // --- Update status ke 'posted' ---
    await db.execute(sql`
      UPDATE accounting_entries SET status = 'posted' WHERE id = ${entryId} AND status = 'draft'
    `);

    logger.info(
      `[accounting_entry] ✅ ${entryNumber} | company_id=${companyId} | Rp ${amountPaid} | ${description} | lines: 2`
    );

    // --- Insert accounting_payments (idempoten via correlation_id) ---
    const payCorrelationId = `pay-tenant-${paymentId}`;
    const paymentMethodMapped =
      (paymentMethod ?? "").toLowerCase() === "cash" ? "cash"
      : (paymentMethod ?? "").toLowerCase() === "qris" ? "qris"
      : "bank";
    try {
      await db.execute(sql`
        INSERT INTO accounting_payments
          (entry_id, company_id, source_module, source_table, source_id,
           payment_type, payment_method, amount, currency, paid_at, date,
           ref, description, correlation_id, journal_id, partner_name,
           created_at, updated_at)
        SELECT
          ${entryId}, ${companyId}, ${sourceModule}, ${"tenant_payments"}, ${paymentId},
          ${"inbound"}::accounting_payment_type, ${paymentMethodMapped},
          ${amountPaid}, ${"IDR"},
          ${transactionDate.toISOString()}::timestamptz, ${dateStr}::date,
          ${ref}, ${description}, ${payCorrelationId},
          ${journalId}, ${businessName ?? null},
          NOW(), NOW()
        WHERE NOT EXISTS (
          SELECT 1 FROM accounting_payments
          WHERE correlation_id = ${payCorrelationId}
             OR (source_table = 'tenant_payments' AND source_id = ${paymentId})
        )
      `);
      logger.info(`[accounting_entry] ✅ accounting_payments tersimpan untuk payment_id=${paymentId}`);
    } catch (e) {
      logger.warn({ err: e }, "[accounting_entry] accounting_payments insert gagal — non-fatal");
    }
  } catch (err) {
    logger.error({ err }, "[accounting_entry] Gagal posting ke accounting_entries");
  }
}
