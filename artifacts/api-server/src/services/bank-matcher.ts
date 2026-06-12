import { db } from "@workspace/db";
import {
  bankMutationsTable,
  bankReconciliationMatchesTable,
  tenantPaymentsTable,
  tenantInvoicesTable,
  tenantBookingsTable,
  tenantsTable,
} from "@workspace/db/schema";
import { eq, and, gte, lte, or, sql } from "drizzle-orm";

const GOPAY_KEYWORDS = ["dompet anak bangsa", "gopay", "gojek"];
const ORDER_ID_REGEX = /\b(ID\d{15,}[A-Z0-9]*|ORD[-_]?\w{6,}|INV[-_]?\w{6,}|\d{15,})\b/gi;

export function normalizeDescription(desc: string): string {
  return desc
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractOrderId(desc: string): string | null {
  const matches = desc.match(ORDER_ID_REGEX);
  return matches?.[0] ?? null;
}

export function detectProvider(desc: string): string | null {
  const lower = desc.toLowerCase();
  for (const kw of GOPAY_KEYWORDS) {
    if (lower.includes(kw)) return kw === "dompet anak bangsa" ? "DOMPET ANAK BANGSA" : "GoPay";
  }
  return null;
}

export function buildMutationKey(date: string, amount: string | number, direction: string): string {
  const d = date.replace(/[-/]/g, "").slice(0, 8);
  const a = Math.round(parseFloat(String(amount)));
  return `${d}_${a}_${direction}`;
}

function dateDiffDays(a: string, b: string): number {
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  return Math.abs(Math.round((da - db) / 86400000));
}

function nameInDescription(name: string | null, desc: string): boolean {
  if (!name) return false;
  const norm = normalizeDescription(name);
  const parts = norm.split(" ").filter((p) => p.length > 2);
  return parts.some((p) => desc.includes(p));
}

interface MatchCandidate {
  candidateType: "payment" | "invoice";
  candidateId: number;
  matchScore: number;
  matchReason: string;
  amountMatch: boolean;
  dateMatch: boolean;
  nameMatch: boolean;
  orderIdMatch: boolean;
  proofMatch: boolean;
}

export async function computeMatchCandidates(
  mutation: typeof bankMutationsTable.$inferSelect
): Promise<MatchCandidate[]> {
  const candidates: MatchCandidate[] = [];
  const mutAmount = parseFloat(String(mutation.amount));
  const mutDate = mutation.transactionDate;
  const mutNorm = mutation.normalizedDescription;
  const mutOrderId = mutation.providerOrderId;

  const dateFrom = new Date(mutDate);
  dateFrom.setDate(dateFrom.getDate() - 3);
  const dateTo = new Date(mutDate);
  dateTo.setDate(dateTo.getDate() + 3);
  const fromStr = dateFrom.toISOString().slice(0, 10);
  const toStr = dateTo.toISOString().slice(0, 10);

  // --- Match against tenant_payments ---
  const payments = await db
    .select({
      id: tenantPaymentsTable.id,
      amount: tenantPaymentsTable.amount,
      paidAt: tenantPaymentsTable.paidAt,
      notes: tenantPaymentsTable.notes,
      proofImageUrl: tenantPaymentsTable.proofImageUrl,
      proofUrl: tenantPaymentsTable.proofUrl,
      referenceNumber: tenantPaymentsTable.referenceNumber,
      tenantName: tenantsTable.businessName,
      ownerName: tenantsTable.ownerName,
    })
    .from(tenantPaymentsTable)
    .leftJoin(tenantsTable, eq(tenantPaymentsTable.tenantId, tenantsTable.id))
    .where(
      and(
        sql`ABS(${tenantPaymentsTable.amount}::numeric - ${mutAmount}) < 1`,
        or(
          and(
            sql`${tenantPaymentsTable.paidAt}::date >= ${fromStr}::date`,
            sql`${tenantPaymentsTable.paidAt}::date <= ${toStr}::date`
          ),
          sql`${tenantPaymentsTable.paidAt} IS NULL`
        )
      )
    )
    .limit(20);

  for (const p of payments) {
    let score = 0;
    const reasons: string[] = [];

    const amountMatch = Math.abs(parseFloat(String(p.amount)) - mutAmount) < 1;
    if (amountMatch) { score += 40; reasons.push("nominal sama"); }

    const payDate = p.paidAt ? new Date(p.paidAt).toISOString().slice(0, 10) : null;
    const diff = payDate ? dateDiffDays(mutDate, payDate) : 99;
    const exactDate = diff === 0;
    const closeDate = diff <= 3;
    if (exactDate) { score += 30; reasons.push("tanggal sama"); }
    else if (closeDate) { score += 15; reasons.push(`tanggal beda ${diff} hari`); }

    const tenantNorm = normalizeDescription(p.tenantName ?? "");
    const ownerNorm = normalizeDescription(p.ownerName ?? "");
    const nm = nameInDescription(p.tenantName, mutNorm) || nameInDescription(p.ownerName, mutNorm);
    if (nm) { score += 15; reasons.push("nama tenant cocok"); }

    const ref = p.referenceNumber ?? "";
    const proofText = [p.proofImageUrl ?? "", p.proofUrl ?? ""].join(" ").toLowerCase();
    let orderIdMatch = false;
    if (mutOrderId && (ref.includes(mutOrderId) || proofText.includes(mutOrderId.toLowerCase()))) {
      orderIdMatch = true;
      score += 15;
      reasons.push("order ID cocok");
    }

    const proofMatch = !!mutOrderId && proofText.includes(mutOrderId.toLowerCase());
    if (proofMatch && !orderIdMatch) { score += 5; reasons.push("order ID di bukti transfer"); }

    if (score >= 30) {
      candidates.push({
        candidateType: "payment",
        candidateId: p.id,
        matchScore: Math.min(score, 100),
        matchReason: reasons.join("; "),
        amountMatch,
        dateMatch: exactDate || closeDate,
        nameMatch: nm,
        orderIdMatch,
        proofMatch,
      });
    }
  }

  // --- Match against tenant_invoices ---
  const invoices = await db
    .select({
      id: tenantInvoicesTable.id,
      totalAmount: tenantInvoicesTable.totalAmount,
      outstandingAmount: tenantInvoicesTable.outstandingAmount,
      dueDate: tenantInvoicesTable.dueDate,
      tenantName: tenantsTable.businessName,
      ownerName: tenantsTable.ownerName,
    })
    .from(tenantInvoicesTable)
    .leftJoin(tenantsTable, eq(tenantInvoicesTable.tenantId, tenantsTable.id))
    .where(
      and(
        sql`(ABS(${tenantInvoicesTable.totalAmount}::numeric - ${mutAmount}) < 1 OR ABS(${tenantInvoicesTable.outstandingAmount}::numeric - ${mutAmount}) < 1)`,
        gte(tenantInvoicesTable.dueDate, fromStr),
        lte(tenantInvoicesTable.dueDate, toStr)
      )
    )
    .limit(20);

  for (const inv of invoices) {
    let score = 0;
    const reasons: string[] = [];

    const amountMatch =
      Math.abs(parseFloat(String(inv.totalAmount)) - mutAmount) < 1 ||
      Math.abs(parseFloat(String(inv.outstandingAmount)) - mutAmount) < 1;
    if (amountMatch) { score += 40; reasons.push("nominal sama"); }

    const diff = inv.dueDate ? dateDiffDays(mutDate, inv.dueDate) : 99;
    const exactDate = diff === 0;
    const closeDate = diff <= 3;
    if (exactDate) { score += 25; reasons.push("tanggal jatuh tempo sama"); }
    else if (closeDate) { score += 12; reasons.push(`tanggal beda ${diff} hari dari jatuh tempo`); }

    const nm = nameInDescription(inv.tenantName, mutNorm) || nameInDescription(inv.ownerName, mutNorm);
    if (nm) { score += 20; reasons.push("nama tenant cocok"); }

    if (score >= 30) {
      candidates.push({
        candidateType: "invoice",
        candidateId: inv.id,
        matchScore: Math.min(score, 100),
        matchReason: reasons.join("; "),
        amountMatch,
        dateMatch: exactDate || closeDate,
        nameMatch: nm,
        orderIdMatch: false,
        proofMatch: false,
      });
    }
  }

  return candidates.sort((a, b) => b.matchScore - a.matchScore);
}

export async function runMatchingForMutation(mutationId: number): Promise<{
  status: "unmatched" | "matched" | "duplicate_need_review";
  candidatesCount: number;
  autoMatched: boolean;
}> {
  const [mutation] = await db
    .select()
    .from(bankMutationsTable)
    .where(eq(bankMutationsTable.id, mutationId))
    .limit(1);

  if (!mutation) throw new Error(`Mutasi ID ${mutationId} tidak ditemukan`);

  // Check for duplicate mutation_key
  const dupes = await db
    .select({ id: bankMutationsTable.id })
    .from(bankMutationsTable)
    .where(eq(bankMutationsTable.mutationKey, mutation.mutationKey));

  if (dupes.length > 1) {
    await db
      .update(bankMutationsTable)
      .set({ status: "duplicate_need_review", updatedAt: new Date() })
      .where(eq(bankMutationsTable.id, mutationId));
    return { status: "duplicate_need_review", candidatesCount: 0, autoMatched: false };
  }

  const candidates = await computeMatchCandidates(mutation);

  // Delete old candidates for this mutation
  await db
    .delete(bankReconciliationMatchesTable)
    .where(eq(bankReconciliationMatchesTable.mutationId, mutationId));

  // Insert new candidates
  if (candidates.length > 0) {
    await db.insert(bankReconciliationMatchesTable).values(
      candidates.map((c) => ({
        mutationId,
        candidateType: c.candidateType,
        candidateId: c.candidateId,
        matchScore: c.matchScore,
        matchReason: c.matchReason,
        amountMatch: c.amountMatch,
        dateMatch: c.dateMatch,
        nameMatch: c.nameMatch,
        orderIdMatch: c.orderIdMatch,
        proofMatch: c.proofMatch,
        status: "candidate" as const,
      }))
    );
  }

  const topScore = candidates[0]?.matchScore ?? 0;

  if (topScore >= 95) {
    await db
      .update(bankMutationsTable)
      .set({ status: "matched", updatedAt: new Date() })
      .where(eq(bankMutationsTable.id, mutationId));
    return { status: "matched", candidatesCount: candidates.length, autoMatched: true };
  }

  const newStatus = candidates.length > 0 ? "matched" : "unmatched";
  await db
    .update(bankMutationsTable)
    .set({ status: candidates.length > 0 ? "matched" : "unmatched", updatedAt: new Date() })
    .where(eq(bankMutationsTable.id, mutationId));

  return {
    status: newStatus === "matched" ? "matched" : "unmatched",
    candidatesCount: candidates.length,
    autoMatched: topScore >= 95,
  };
}
