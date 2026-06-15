import { db } from "@workspace/db";
import { bankJournalEntriesTable, bankAccountBalancesTable, bankMutationsTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";

export interface PostJournalOptions {
  mutationId: number;
  transactionDate: string;
  description: string;
  amount: number;
  direction: "IN" | "OUT";
  bankAccountId: string;
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
  const journalId = `BJ-${datePart}-${opts.mutationId}`;

  const [existing] = await db
    .select({ id: bankJournalEntriesTable.id })
    .from(bankJournalEntriesTable)
    .where(eq(bankJournalEntriesTable.journalId, journalId))
    .limit(1);

  if (!existing) {
    const debitAccountId  = opts.direction === "IN"  ? "cash_in_bank"   : "operating_expense";
    const creditAccountId = opts.direction === "IN"  ? "tenant_revenue"  : "cash_in_bank";
    const debitAmount  = opts.direction === "IN"  ? String(opts.amount) : "0";
    const creditAmount = opts.direction === "OUT" ? String(opts.amount) : "0";

    await db.insert(bankJournalEntriesTable).values({
      journalId,
      mutationId: opts.mutationId,
      companyId: opts.companyId ?? null,
      ownerApp: opts.ownerApp ?? "tenant_management",
      sourceApp: opts.sourceApp ?? "tenant_management",
      sourceModule: opts.sourceModule ?? "bank_reconciliation",
      transactionDate: opts.transactionDate,
      description: opts.description,
      debitAccountId,
      creditAccountId,
      debitAmount,
      creditAmount,
      currency: "IDR",
      status: "posted",
      createdBy: opts.createdBy ?? null,
      siteId: opts.siteId ?? null,
      metadata: opts.metadata ?? null,
    });
  }

  await db.update(bankMutationsTable)
    .set({ accountingPosted: true, journalId, updatedAt: new Date() })
    .where(eq(bankMutationsTable.id, opts.mutationId));

  await upsertAccountBalance({
    bankAccountId: opts.bankAccountId,
    delta: opts.direction === "IN" ? opts.amount : -opts.amount,
    reconciledAmount: opts.amount,
    companyId: opts.companyId ?? null,
    ownerApp: opts.ownerApp ?? "tenant_management",
    siteId: opts.siteId ?? null,
  });

  return { journalId, alreadyPosted: false };
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
        : sql`${bankAccountBalancesTable.bankAccountId} = ${opts.bankAccountId} AND ${bankAccountBalancesTable.siteId} IS NULL`
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
