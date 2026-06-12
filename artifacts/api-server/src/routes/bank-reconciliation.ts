import { Router, type IRouter } from "express";
import multer from "multer";
import { db } from "@workspace/db";
import {
  bankMutationsTable,
  bankReconciliationMatchesTable,
  tenantPaymentsTable,
  tenantInvoicesTable,
  tenantBookingsTable,
  tenantsTable,
} from "@workspace/db/schema";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import { logAudit } from "../lib/audit";
import {
  normalizeDescription,
  extractOrderId,
  detectProvider,
  buildMutationKey,
  runMatchingForMutation,
  computeMatchCandidates,
} from "../services/bank-matcher";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseRows(rows: string[][]): Array<typeof bankMutationsTable.$inferInsert> {
  const header = rows[0]?.map((h) => (h ?? "").trim().toLowerCase()) ?? [];

  const idx = (candidates: string[]) =>
    candidates.map((c) => header.indexOf(c)).find((i) => i >= 0) ?? -1;

  const dateIdx    = idx(["tanggal", "date", "tgl", "transaction_date"]);
  const descIdx    = idx(["keterangan", "description", "desc", "deskripsi", "ket"]);
  const creditIdx  = idx(["kredit", "credit", "cr", "masuk", "credit_amount"]);
  const debitIdx   = idx(["debet", "debit", "db", "keluar", "debit_amount"]);
  const amountIdx  = idx(["nominal", "amount", "jumlah"]);

  return rows.slice(1).flatMap((row) => {
    const raw = (i: number) => (i >= 0 ? (row[i] ?? "").trim() : "");
    const num = (s: string) => parseFloat(s.replace(/[^0-9.-]/g, "")) || 0;

    const date = raw(dateIdx);
    if (!date) return [];

    const credit = num(raw(creditIdx));
    const debit  = num(raw(debitIdx));
    let amount   = num(raw(amountIdx));
    let direction: string;

    if (credit > 0 && debit === 0) {
      direction = "IN";
      amount = credit;
    } else if (debit > 0 && credit === 0) {
      direction = "OUT";
      amount = debit;
    } else if (amount > 0) {
      direction = "IN";
    } else {
      return [];
    }

    const description = raw(descIdx);
    const normDesc    = normalizeDescription(description);
    const provider    = detectProvider(description);
    const orderId     = extractOrderId(description);
    const mutKey      = buildMutationKey(date, amount, direction);

    return [{
      transactionDate:      date,
      description,
      creditAmount:         String(credit),
      debitAmount:          String(debit),
      amount:               String(amount),
      direction,
      mutationKey:          mutKey,
      normalizedDescription: normDesc,
      providerName:         provider ?? undefined,
      providerOrderId:      orderId ?? undefined,
      rawPayload:           Object.fromEntries(header.map((h, i) => [h, row[i] ?? ""])) as Record<string, unknown>,
      status:               "unmatched",
    }];
  });
}

// ── POST /bank-reconciliation/import ─────────────────────────────────────────

const importJsonSchema = z.object({
  rows: z.array(z.array(z.string())).min(2),
  bankAccountId: z.string().optional(),
});

router.post("/bank-reconciliation/import", upload.single("file"), async (req, res) => {
  let rows: string[][];
  let bankAccountId: string | undefined;

  if (req.file) {
    // CSV parse
    const text = req.file.buffer.toString("utf-8");
    rows = text
      .split(/\r?\n/)
      .filter((l) => l.trim())
      .map((l) => l.split(",").map((c) => c.replace(/^"|"$/g, "").trim()));
    bankAccountId = (req.body?.bankAccountId as string | undefined) ?? undefined;
  } else {
    const parsed = importJsonSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Format tidak valid", detail: parsed.error.issues });
      return;
    }
    rows = parsed.data.rows;
    bankAccountId = parsed.data.bankAccountId;
  }

  const mutations = parseRows(rows);
  if (mutations.length === 0) {
    res.status(400).json({ error: "Tidak ada baris valid yang bisa diproses" });
    return;
  }

  const siteId: number | undefined = (req as any).siteId > 0 ? (req as any).siteId : undefined;
  const toInsert = mutations.map((m) => ({ ...m, bankAccountId: bankAccountId ?? null, siteId: siteId ?? null }));

  const inserted = await db.insert(bankMutationsTable).values(toInsert).returning({ id: bankMutationsTable.id });
  const ids = inserted.map((r) => r.id);

  logAudit(req, {
    action: "bank_mutation_import",
    entityType: "bank_mutations",
    afterData: { count: ids.length, bankAccountId },
  });

  // Run matching for all imported mutations
  const matchResults = await Promise.allSettled(ids.map((id) => runMatchingForMutation(id)));
  const autoMatched = matchResults.filter(
    (r) => r.status === "fulfilled" && (r.value as any).autoMatched
  ).length;
  const duplicates = matchResults.filter(
    (r) => r.status === "fulfilled" && (r.value as any).status === "duplicate_need_review"
  ).length;

  if (duplicates > 0) {
    logAudit(req, {
      action: "bank_mutation_duplicate_detected",
      entityType: "bank_mutations",
      afterData: { duplicateCount: duplicates },
    });
  }
  if (autoMatched > 0) {
    logAudit(req, {
      action: "bank_mutation_auto_match",
      entityType: "bank_mutations",
      afterData: { autoMatched },
    });
  }

  res.json({ success: true, imported: ids.length, autoMatched, duplicates });
});

// ── GET /bank-reconciliation/mutations ───────────────────────────────────────

router.get("/bank-reconciliation/mutations", async (req, res) => {
  const siteId: number | undefined = (req as any).siteId > 0 ? (req as any).siteId : undefined;
  const { status, direction, provider, dateFrom, dateTo, amountMin, amountMax } = req.query as Record<string, string>;

  const conditions = [];
  if (siteId) conditions.push(eq(bankMutationsTable.siteId, siteId));
  if (status && status !== "all") conditions.push(eq(bankMutationsTable.status, status));
  if (direction && direction !== "all") conditions.push(eq(bankMutationsTable.direction, direction));
  if (provider) conditions.push(sql`lower(${bankMutationsTable.providerName}) like ${"%" + provider.toLowerCase() + "%"}`);
  if (dateFrom) conditions.push(sql`${bankMutationsTable.transactionDate} >= ${dateFrom}`);
  if (dateTo)   conditions.push(sql`${bankMutationsTable.transactionDate} <= ${dateTo}`);
  if (amountMin) conditions.push(sql`${bankMutationsTable.amount}::numeric >= ${parseFloat(amountMin)}`);
  if (amountMax) conditions.push(sql`${bankMutationsTable.amount}::numeric <= ${parseFloat(amountMax)}`);

  const rows = await db
    .select()
    .from(bankMutationsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(bankMutationsTable.transactionDate), desc(bankMutationsTable.id))
    .limit(500);

  res.json(rows);
});

// ── GET /bank-reconciliation/matches/:mutationId ─────────────────────────────

router.get("/bank-reconciliation/matches/:mutationId", async (req, res) => {
  const mutationId = parseInt(req.params.mutationId, 10);
  if (isNaN(mutationId)) { res.status(400).json({ error: "ID tidak valid" }); return; }

  const [mutation] = await db
    .select()
    .from(bankMutationsTable)
    .where(eq(bankMutationsTable.id, mutationId))
    .limit(1);

  if (!mutation) { res.status(404).json({ error: "Mutasi tidak ditemukan" }); return; }

  const matches = await db
    .select()
    .from(bankReconciliationMatchesTable)
    .where(eq(bankReconciliationMatchesTable.mutationId, mutationId))
    .orderBy(desc(bankReconciliationMatchesTable.matchScore));

  // Enrich candidates with detail info
  const enriched = await Promise.all(
    matches.map(async (m) => {
      let detail: Record<string, unknown> = {};
      if (m.candidateType === "payment") {
        const [p] = await db
          .select({
            id: tenantPaymentsTable.id,
            amount: tenantPaymentsTable.amount,
            paidAt: tenantPaymentsTable.paidAt,
            method: tenantPaymentsTable.method,
            notes: tenantPaymentsTable.notes,
            tenantName: tenantsTable.businessName,
            ownerName: tenantsTable.ownerName,
            paymentNumber: tenantPaymentsTable.paymentNumber,
          })
          .from(tenantPaymentsTable)
          .leftJoin(tenantsTable, eq(tenantPaymentsTable.tenantId, tenantsTable.id))
          .where(eq(tenantPaymentsTable.id, m.candidateId))
          .limit(1);
        if (p) detail = p as Record<string, unknown>;
      } else if (m.candidateType === "invoice") {
        const [inv] = await db
          .select({
            id: tenantInvoicesTable.id,
            invoiceNumber: tenantInvoicesTable.invoiceNumber,
            totalAmount: tenantInvoicesTable.totalAmount,
            outstandingAmount: tenantInvoicesTable.outstandingAmount,
            dueDate: tenantInvoicesTable.dueDate,
            status: tenantInvoicesTable.status,
            tenantName: tenantsTable.businessName,
            ownerName: tenantsTable.ownerName,
          })
          .from(tenantInvoicesTable)
          .leftJoin(tenantsTable, eq(tenantInvoicesTable.tenantId, tenantsTable.id))
          .where(eq(tenantInvoicesTable.id, m.candidateId))
          .limit(1);
        if (inv) detail = inv as Record<string, unknown>;
      }
      return { ...m, detail };
    })
  );

  res.json({ mutation, matches: enriched });
});

// ── POST /bank-reconciliation/:mutationId/approve ────────────────────────────

const approveSchema = z.object({
  matchId: z.number().int().positive(),
});

router.post("/bank-reconciliation/:mutationId/approve", async (req, res) => {
  const mutationId = parseInt(req.params.mutationId, 10);
  if (isNaN(mutationId)) { res.status(400).json({ error: "ID tidak valid" }); return; }

  const parsed = approveSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Parameter tidak valid", detail: parsed.error.issues }); return; }

  const { matchId } = parsed.data;

  const [match] = await db
    .select()
    .from(bankReconciliationMatchesTable)
    .where(and(
      eq(bankReconciliationMatchesTable.id, matchId),
      eq(bankReconciliationMatchesTable.mutationId, mutationId)
    ))
    .limit(1);

  if (!match) { res.status(404).json({ error: "Kandidat match tidak ditemukan" }); return; }

  await db.transaction(async (tx) => {
    await tx.update(bankReconciliationMatchesTable)
      .set({ status: "approved" })
      .where(eq(bankReconciliationMatchesTable.id, matchId));

    await tx.update(bankReconciliationMatchesTable)
      .set({ status: "rejected" })
      .where(and(
        eq(bankReconciliationMatchesTable.mutationId, mutationId),
        sql`${bankReconciliationMatchesTable.id} != ${matchId}`
      ));

    const updateData: Partial<typeof bankMutationsTable.$inferInsert> = {
      status: "approved",
      updatedAt: new Date(),
    };
    if (match.candidateType === "payment") updateData.matchedPaymentId = match.candidateId;
    if (match.candidateType === "invoice" || match.candidateType === "order") updateData.matchedOrderId = match.candidateId;

    await tx.update(bankMutationsTable)
      .set(updateData)
      .where(eq(bankMutationsTable.id, mutationId));
  });

  logAudit(req, {
    action: "bank_mutation_approved",
    entityType: "bank_mutations",
    entityId: mutationId,
    afterData: { matchId, candidateType: match.candidateType, candidateId: match.candidateId },
  });

  res.json({ success: true });
});

// ── POST /bank-reconciliation/:mutationId/reject ─────────────────────────────

router.post("/bank-reconciliation/:mutationId/reject", async (req, res) => {
  const mutationId = parseInt(req.params.mutationId, 10);
  if (isNaN(mutationId)) { res.status(400).json({ error: "ID tidak valid" }); return; }

  await db.update(bankMutationsTable)
    .set({ status: "rejected", updatedAt: new Date() })
    .where(eq(bankMutationsTable.id, mutationId));

  await db.update(bankReconciliationMatchesTable)
    .set({ status: "rejected" })
    .where(eq(bankReconciliationMatchesTable.mutationId, mutationId));

  logAudit(req, {
    action: "bank_mutation_rejected",
    entityType: "bank_mutations",
    entityId: mutationId,
  });

  res.json({ success: true });
});

// ── POST /bank-reconciliation/run-matching ────────────────────────────────────

router.post("/bank-reconciliation/run-matching", async (req, res) => {
  const siteId: number | undefined = (req as any).siteId > 0 ? (req as any).siteId : undefined;

  const conditions = [
    sql`${bankMutationsTable.status} IN ('unmatched', 'matched')`,
  ];
  if (siteId) conditions.push(eq(bankMutationsTable.siteId, siteId));

  const pending = await db
    .select({ id: bankMutationsTable.id })
    .from(bankMutationsTable)
    .where(and(...conditions))
    .limit(200);

  const results = await Promise.allSettled(
    pending.map((m) => runMatchingForMutation(m.id))
  );

  const summary = { total: pending.length, autoMatched: 0, withCandidates: 0, unmatched: 0, duplicates: 0 };
  for (const r of results) {
    if (r.status === "fulfilled") {
      const v = r.value as any;
      if (v.autoMatched) summary.autoMatched++;
      else if (v.status === "duplicate_need_review") summary.duplicates++;
      else if (v.candidatesCount > 0) summary.withCandidates++;
      else summary.unmatched++;
    }
  }

  logAudit(req, {
    action: "bank_reconciliation_run_matching",
    entityType: "bank_mutations",
    afterData: summary,
  });

  res.json({ success: true, ...summary });
});

// ── POST /bank-reconciliation/:mutationId/manual-match ───────────────────────

const manualMatchSchema = z.object({
  candidateType: z.enum(["payment", "invoice"]),
  candidateId: z.number().int().positive(),
});

router.post("/bank-reconciliation/:mutationId/manual-match", async (req, res) => {
  const mutationId = parseInt(req.params.mutationId, 10);
  if (isNaN(mutationId)) { res.status(400).json({ error: "ID tidak valid" }); return; }

  const parsed = manualMatchSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Parameter tidak valid" }); return; }

  const { candidateType, candidateId } = parsed.data;

  const [existing] = await db
    .select({ id: bankReconciliationMatchesTable.id })
    .from(bankReconciliationMatchesTable)
    .where(and(
      eq(bankReconciliationMatchesTable.mutationId, mutationId),
      eq(bankReconciliationMatchesTable.candidateType, candidateType),
      eq(bankReconciliationMatchesTable.candidateId, candidateId)
    ))
    .limit(1);

  let matchId: number;
  if (existing) {
    matchId = existing.id;
  } else {
    const [ins] = await db.insert(bankReconciliationMatchesTable).values({
      mutationId,
      candidateType,
      candidateId,
      matchScore: 100,
      matchReason: "manual match oleh admin",
      amountMatch: false,
      dateMatch: false,
      nameMatch: false,
      orderIdMatch: false,
      proofMatch: false,
      status: "candidate",
    }).returning({ id: bankReconciliationMatchesTable.id });
    matchId = ins.id;
  }

  await db.transaction(async (tx) => {
    await tx.update(bankReconciliationMatchesTable)
      .set({ status: "approved" })
      .where(eq(bankReconciliationMatchesTable.id, matchId));

    const updateData: Partial<typeof bankMutationsTable.$inferInsert> = {
      status: "approved",
      updatedAt: new Date(),
    };
    if (candidateType === "payment") updateData.matchedPaymentId = candidateId;
    else updateData.matchedOrderId = candidateId;

    await tx.update(bankMutationsTable)
      .set(updateData)
      .where(eq(bankMutationsTable.id, mutationId));
  });

  logAudit(req, {
    action: "bank_mutation_manual_match",
    entityType: "bank_mutations",
    entityId: mutationId,
    afterData: { candidateType, candidateId },
  });

  res.json({ success: true });
});

export default router;
