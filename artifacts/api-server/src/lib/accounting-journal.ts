import { db } from "@workspace/db";
import {
  accountingEntriesTable,
  accountingEntryLinesTable,
  bankAccountBalancesTable,
  bankMutationsTable,
  bankCoaRulesTable,
} from "@workspace/db/schema";
import { eq, sql, and } from "drizzle-orm";

const COA_KAS        = { code: "1-1001", name: "Kas dan Bank" };
const COA_PENDAPATAN = { code: "4-1001", name: "Pendapatan Sewa" };
const COA_BIAYA      = { code: "5-1001", name: "Biaya Operasional" };
const COA_PPN        = { code: "2-1001", name: "Hutang PPN Keluaran" };
const COA_PPH        = { code: "2-1002", name: "Hutang PPh Pasal 4 ayat 2" };

export interface PostJournalOptions {
  mutationId: number;
  transactionDate: string;
  description: string;
  amount: number;
  direction: "IN" | "OUT";
  bankAccountId: string;
  taxAmount?: number;
  taxType?: "ppn" | "pph" | null;
  companyId?: number | null;
  ownerApp?: string | null;
  sourceApp?: string | null;
  sourceModule?: string | null;
  createdBy?: string | null;
  siteId?: number | null;
  metadata?: Record<string, unknown> | null;
}

export interface PostJournalResult {
  journalId: string;
  alreadyPosted: boolean;
}

async function resolveCoaForTransaction(opts: {
  direction: "IN" | "OUT";
  description: string;
}): Promise<{ debit: { code: string; name: string }; credit: { code: string; name: string } }> {
  try {
    const rules = await db
      .select()
      .from(bankCoaRulesTable)
      .where(
        and(
          eq(bankCoaRulesTable.isActive, true),
          sql`(${bankCoaRulesTable.direction} = ${opts.direction} OR ${bankCoaRulesTable.direction} = 'ALL')`,
        ),
      );

    for (const rule of rules) {
      if (rule.descriptionPattern) {
        try {
          const re = new RegExp(rule.descriptionPattern, "i");
          if (!re.test(opts.description)) continue;
        } catch {
          continue;
        }
      }
      const acc = { code: rule.coaCode, name: rule.coaName };
      return opts.direction === "IN"
        ? { debit: COA_KAS, credit: acc }
        : { debit: acc, credit: COA_KAS };
    }
  } catch {
    // CoA rules belum ada atau error — pakai default
  }

  return opts.direction === "IN"
    ? { debit: COA_KAS, credit: COA_PENDAPATAN }
    : { debit: COA_BIAYA, credit: COA_KAS };
}

async function resolveBankJournalId(companyId: number): Promise<number> {
  const row = await db.execute<{ id: number }>(
    sql`SELECT id FROM accounting_journals WHERE company_id = ${companyId} AND type = 'bank' LIMIT 1`
  );
  const jId = (row as any).rows?.[0]?.id;
  if (jId) return Number(jId);
  const fallback = await db.execute<{ id: number }>(
    sql`SELECT id FROM accounting_journals WHERE company_id = ${companyId} LIMIT 1`
  );
  const fId = (fallback as any).rows?.[0]?.id;
  return fId ? Number(fId) : 1;
}

export async function postAccountingJournal(opts: PostJournalOptions): Promise<PostJournalResult> {
  const [mutation] = await db
    .select({ accountingPosted: bankMutationsTable.accountingPosted, journalId: bankMutationsTable.journalId })
    .from(bankMutationsTable)
    .where(eq(bankMutationsTable.id, opts.mutationId))
    .limit(1);

  if (mutation?.accountingPosted || mutation?.journalId) {
    return { journalId: mutation.journalId ?? "", alreadyPosted: true };
  }

  const datePart = opts.transactionDate.replace(/[-/]/g, "").slice(0, 8);
  const correlationId = `BJ-${datePart}-${opts.mutationId}`;

  const [existingEntry] = await db
    .select({ id: accountingEntriesTable.id })
    .from(accountingEntriesTable)
    .where(eq(accountingEntriesTable.correlationId, correlationId))
    .limit(1);

  if (!existingEntry) {
    const companyId = opts.companyId ?? 1;
    const journalDbId = await resolveBankJournalId(companyId);
    const taxAmount = opts.taxAmount ?? 0;
    const { debit, credit } = await resolveCoaForTransaction({
      direction: opts.direction,
      description: opts.description,
    });

    const year = opts.transactionDate.slice(0, 4);
    const maxRow = await db.execute<{ max_num: string | null }>(
      sql`SELECT MAX(entry_number) AS max_num FROM accounting_entries
          WHERE journal_id = ${journalDbId} AND entry_number LIKE ${"BNK/" + year + "/%"}`
    );
    const maxNum = (maxRow as any).rows?.[0]?.max_num as string | null;
    let nextSeq = 1;
    if (maxNum) {
      const parts = maxNum.split("/");
      const lastNum = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastNum)) nextSeq = lastNum + 1;
    }
    const entryNumber = `BNK/${year}/${String(nextSeq).padStart(4, "0")}`;
    const srcModule = opts.sourceModule ?? "bank_reconciliation";

    const entryResult = await db.execute(sql`
      INSERT INTO accounting_entries
        (entry_number, journal_id, date, ref, description, status,
         source, source_module, source_table, source_id,
         total_debit, total_credit, company_id, correlation_id, created_at)
      VALUES
        (${entryNumber}, ${journalDbId}, ${opts.transactionDate}::date,
         ${"BM-" + opts.mutationId}, ${opts.description}, 'draft',
         ${"bank_mutation_import"}::accounting_entry_source,
         ${srcModule}, ${"bank_mutations"}, ${opts.mutationId},
         ${opts.amount}, ${opts.amount},
         ${companyId}, ${correlationId}, NOW())
      RETURNING id
    `);
    const entryId = (entryResult as any).rows?.[0]?.id != null
      ? Number((entryResult as any).rows[0].id)
      : null;

    if (entryId) {
      const debitAmt = opts.direction === "IN" ? opts.amount : opts.amount - taxAmount;
      const creditAmt = opts.direction === "IN" ? opts.amount - taxAmount : opts.amount;

      await db.execute(sql`
        INSERT INTO accounting_entry_lines
          (entry_id, description, debit, credit, source_module, source_id, company_id)
        VALUES
          (${entryId}, ${debit.name},
           ${opts.direction === "IN" ? opts.amount : debitAmt},
           ${opts.direction === "IN" ? 0 : opts.amount},
           ${srcModule}, ${opts.mutationId}, ${companyId}),
          (${entryId}, ${credit.name},
           ${opts.direction === "IN" ? 0 : creditAmt},
           ${opts.direction === "IN" ? creditAmt : 0},
           ${srcModule}, ${opts.mutationId}, ${companyId})
      `);

      if (taxAmount > 0) {
        const taxAccName = opts.taxType === "pph" ? COA_PPH.name : COA_PPN.name;
        await db.execute(sql`
          INSERT INTO accounting_entry_lines
            (entry_id, description, debit, credit, source_module, source_id, company_id)
          VALUES
            (${entryId}, ${taxAccName}, 0, ${taxAmount}, ${srcModule}, ${opts.mutationId}, ${companyId})
        `);
      }

      await db.execute(sql`UPDATE accounting_entries SET status = 'posted' WHERE id = ${entryId}`);
    }
  }

  await db.update(bankMutationsTable)
    .set({ accountingPosted: true, journalId: correlationId, updatedAt: new Date() })
    .where(eq(bankMutationsTable.id, opts.mutationId));

  await upsertAccountBalance({
    bankAccountId: opts.bankAccountId,
    delta: opts.direction === "IN" ? opts.amount : -opts.amount,
    reconciledAmount: opts.amount,
    companyId: opts.companyId ?? null,
    ownerApp: opts.ownerApp ?? "tenant_management",
    siteId: opts.siteId ?? null,
  });

  return { journalId: correlationId, alreadyPosted: false };
}

async function upsertAccountBalance(opts: {
  bankAccountId: string;
  delta: number;
  reconciledAmount: number;
  companyId: number | null;
  ownerApp: string;
  siteId: number | null;
}): Promise<void> {
  const now = new Date();

  const [existing] = await db
    .select({ id: bankAccountBalancesTable.id, currentBalance: bankAccountBalancesTable.currentBalance })
    .from(bankAccountBalancesTable)
    .where(
      opts.siteId
        ? sql`${bankAccountBalancesTable.bankAccountId} = ${opts.bankAccountId} AND ${bankAccountBalancesTable.siteId} = ${opts.siteId}`
        : sql`${bankAccountBalancesTable.bankAccountId} = ${opts.bankAccountId} AND ${bankAccountBalancesTable.siteId} IS NULL`,
    )
    .limit(1);

  if (existing) {
    const newBalance = parseFloat(String(existing.currentBalance)) + opts.delta;
    await db.update(bankAccountBalancesTable)
      .set({
        currentBalance: String(newBalance),
        lastReconciledBalance: String(opts.reconciledAmount),
        lastReconciledAt: now,
        updatedAt: now,
      })
      .where(eq(bankAccountBalancesTable.id, existing.id));
  } else {
    await db.insert(bankAccountBalancesTable).values({
      bankAccountId: opts.bankAccountId,
      companyId: opts.companyId,
      ownerApp: opts.ownerApp,
      siteId: opts.siteId,
      currentBalance: String(opts.delta),
      lastReconciledBalance: String(opts.reconciledAmount),
      lastReconciledAt: now,
    });
  }
}
