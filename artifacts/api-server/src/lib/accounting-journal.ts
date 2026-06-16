import { db } from "@workspace/db";
import {
  bankJournalEntriesTable,
  bankAccountBalancesTable,
  bankMutationsTable,
  bankCoaRulesTable,
} from "@workspace/db/schema";
import { eq, sql, and } from "drizzle-orm";

// ── Kode CoA default (standar mall Indonesia) ─────────────────────────────────
const COA_KAS        = { id: "1-1001", name: "Kas dan Bank" };
const COA_PENDAPATAN = { id: "4-1001", name: "Pendapatan Sewa" };
const COA_BIAYA      = { id: "5-1001", name: "Biaya Operasional" };
const COA_PPN        = { id: "2-1001", name: "Hutang PPN Keluaran" };
const COA_PPH        = { id: "2-1002", name: "Hutang PPh Pasal 4 ayat 2" };

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

// ── Cari CoA dari rules (berdasarkan direction & description pattern) ──────────
async function resolveCoaForTransaction(opts: {
  direction: "IN" | "OUT";
  description: string;
}): Promise<{ debit: { id: string; name: string }; credit: { id: string; name: string } }> {
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
      const acc = { id: rule.coaCode, name: rule.coaName };
      return opts.direction === "IN"
        ? { debit: COA_KAS, credit: acc }
        : { debit: acc, credit: COA_KAS };
    }
  } catch {
    // Tabel CoA belum ada atau error — pakai default
  }

  return opts.direction === "IN"
    ? { debit: COA_KAS, credit: COA_PENDAPATAN }
    : { debit: COA_BIAYA, credit: COA_KAS };
}

// ── Fungsi utama posting jurnal ───────────────────────────────────────────────
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
    const taxAmount = opts.taxAmount ?? 0;
    // Untuk kas masuk: debit = total, kredit = neto + pajak terpisah
    const netAmount = opts.direction === "IN" ? opts.amount - taxAmount : opts.amount;

    const { debit, credit } = await resolveCoaForTransaction({
      direction: opts.direction,
      description: opts.description,
    });

    // Tentukan akun pajak
    const taxAccount =
      opts.taxType === "pph" ? COA_PPH :
      opts.taxType === "ppn" ? COA_PPN :
      taxAmount > 0           ? COA_PPN :
      null;

    await db.insert(bankJournalEntriesTable).values({
      journalId,
      mutationId: opts.mutationId,
      companyId: opts.companyId ?? null,
      ownerApp: opts.ownerApp ?? "tenant_management",
      sourceApp: opts.sourceApp ?? "tenant_management",
      sourceModule: opts.sourceModule ?? "bank_reconciliation",
      transactionDate: opts.transactionDate,
      description: opts.description,
      debitAccountId: debit.id,
      debitAccountName: debit.name,
      creditAccountId: credit.id,
      creditAccountName: credit.name,
      debitAmount: opts.direction === "IN" ? String(opts.amount) : String(netAmount),
      creditAmount: opts.direction === "IN" ? String(netAmount) : String(opts.amount),
      taxAmount: String(taxAmount),
      taxAccountId: taxAccount?.id ?? null,
      taxAccountName: taxAccount?.name ?? null,
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

// ── Update saldo rekening ─────────────────────────────────────────────────────
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
