import { Router, type IRouter } from "express";
import multer from "multer";
import { db } from "@workspace/db";
import {
  bankMutationsTable,
  bankReconciliationMatchesTable,
  bankJournalEntriesTable,
  bankAccountBalancesTable,
  tenantPaymentsTable,
  tenantInvoicesTable,
  tenantBookingsTable,
  tenantsTable,
  financePaymentEventsTable,
} from "@workspace/db/schema";
import { eq, and, desc, sql, inArray, isNull, gt, ne } from "drizzle-orm";
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
import { writePaymentEvent, normalizePaymentMethod } from "../lib/payment-events";
import { postAccountingJournal } from "../lib/accounting-journal";

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

// ── GET /bank-reconciliation/kpi ──────────────────────────────────────────────

router.get("/bank-reconciliation/kpi", async (req, res) => {
  const siteId: number | undefined = (req as any).siteId > 0 ? (req as any).siteId : undefined;

  const [mutStats, eventStats, invoiceStats] = await Promise.all([
    db
      .select({
        status: bankMutationsTable.status,
        count: sql<number>`count(*)::int`,
      })
      .from(bankMutationsTable)
      .where(siteId ? eq(bankMutationsTable.siteId, siteId) : undefined)
      .groupBy(bankMutationsTable.status),

    db
      .select({
        paymentStatus: financePaymentEventsTable.paymentStatus,
        count: sql<number>`count(*)::int`,
        totalAmount: sql<string>`coalesce(sum(amount::numeric), 0)::text`,
      })
      .from(financePaymentEventsTable)
      .where(siteId ? eq(financePaymentEventsTable.siteId, siteId) : undefined)
      .groupBy(financePaymentEventsTable.paymentStatus),

    db
      .select({
        status: tenantInvoicesTable.status,
        count: sql<number>`count(*)::int`,
        totalPaid: sql<string>`coalesce(sum(paid_amount::numeric), 0)::text`,
      })
      .from(tenantInvoicesTable)
      .where(siteId ? eq(tenantInvoicesTable.siteId, siteId) : undefined)
      .groupBy(tenantInvoicesTable.status),
  ]);

  const mutMap = Object.fromEntries(mutStats.map((r) => [r.status, r.count]));
  const evtMap = Object.fromEntries(eventStats.map((r) => [r.paymentStatus, { count: r.count, amount: parseFloat(r.totalAmount) }]));
  const invMap = Object.fromEntries(invoiceStats.map((r) => [r.status, { count: r.count, totalPaid: parseFloat(r.totalPaid) }]));

  res.json({
    mutations: {
      unmatched: mutMap["unmatched"] ?? 0,
      matched: mutMap["matched"] ?? 0,
      approved: mutMap["approved"] ?? 0,
      rejected: mutMap["rejected"] ?? 0,
      duplicateNeedReview: mutMap["duplicate_need_review"] ?? 0,
      total: Object.values(mutMap).reduce((a, b) => a + b, 0),
    },
    paymentEvents: {
      pending: evtMap["pending"]?.count ?? 0,
      waitingConfirmation: evtMap["waiting_confirmation"]?.count ?? 0,
      confirmed: evtMap["confirmed"]?.count ?? 0,
      rejected: evtMap["rejected"]?.count ?? 0,
      total: Object.values(evtMap).reduce((a, b) => a + b.count, 0),
      totalConfirmedAmount: evtMap["confirmed"]?.amount ?? 0,
    },
    invoices: {
      paid: invMap["paid"]?.count ?? 0,
      partial: invMap["partial"]?.count ?? 0,
      unpaid: invMap["unpaid"]?.count ?? 0,
      overdue: invMap["overdue"]?.count ?? 0,
      totalPaidAmount: invMap["paid"]?.totalPaid ?? 0,
      totalPartialPaidAmount: invMap["partial"]?.totalPaid ?? 0,
    },
  });
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
      } else if (m.candidateType === "payment_event") {
        const [fpe] = await db
          .select({
            id: financePaymentEventsTable.id,
            amount: financePaymentEventsTable.amount,
            paymentMethod: financePaymentEventsTable.paymentMethod,
            paymentReference: financePaymentEventsTable.paymentReference,
            paymentStatus: financePaymentEventsTable.paymentStatus,
            sourceModule: financePaymentEventsTable.sourceModule,
            createdAt: financePaymentEventsTable.createdAt,
            tenantName: tenantsTable.businessName,
            ownerName: tenantsTable.ownerName,
          })
          .from(financePaymentEventsTable)
          .leftJoin(tenantsTable, eq(financePaymentEventsTable.tenantId, tenantsTable.id))
          .where(eq(financePaymentEventsTable.id, m.candidateId))
          .limit(1);
        if (fpe) detail = fpe as Record<string, unknown>;
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

  const [[match], [mutation]] = await Promise.all([
    db.select().from(bankReconciliationMatchesTable)
      .where(and(
        eq(bankReconciliationMatchesTable.id, matchId),
        eq(bankReconciliationMatchesTable.mutationId, mutationId),
      )).limit(1),
    db.select().from(bankMutationsTable)
      .where(eq(bankMutationsTable.id, mutationId)).limit(1),
  ]);

  if (!match) { res.status(404).json({ error: "Kandidat match tidak ditemukan" }); return; }
  if (!mutation) { res.status(404).json({ error: "Mutasi tidak ditemukan" }); return; }

  const now = new Date();
  let newPaymentId: number | null = null;

  await db.transaction(async (tx) => {
    await tx.update(bankReconciliationMatchesTable)
      .set({ status: "approved" })
      .where(eq(bankReconciliationMatchesTable.id, matchId));

    await tx.update(bankReconciliationMatchesTable)
      .set({ status: "rejected" })
      .where(and(
        eq(bankReconciliationMatchesTable.mutationId, mutationId),
        sql`${bankReconciliationMatchesTable.id} != ${matchId}`,
      ));

    const updateData: Partial<typeof bankMutationsTable.$inferInsert> = {
      status: "approved",
      updatedAt: now,
    };

    if (match.candidateType === "payment") {
      updateData.matchedPaymentId = match.candidateId;

      await tx.update(financePaymentEventsTable)
        .set({
          paymentStatus: "confirmed",
          bankMutationId: mutationId,
          isReconciled: true,
          reconciledAt: now,
          updatedAt: now,
        })
        .where(and(
          eq(financePaymentEventsTable.sourceTable, "tenant_payments"),
          eq(financePaymentEventsTable.sourceId, match.candidateId),
        ));

    } else if (match.candidateType === "invoice") {
      updateData.matchedOrderId = match.candidateId;

      const [invoice] = await tx
        .select()
        .from(tenantInvoicesTable)
        .where(eq(tenantInvoicesTable.id, match.candidateId))
        .for("update");

      if (invoice && invoice.status !== "cancelled" && invoice.status !== "paid") {
        const mutAmount = parseFloat(String(mutation.amount));
        const newPaidAmount = Number(invoice.paidAmount) + mutAmount;
        const total = Number(invoice.totalAmount);
        const outstanding = Math.max(total - newPaidAmount, 0);

        let newStatus: string;
        if (newPaidAmount >= total) newStatus = "paid";
        else if (newPaidAmount > 0) newStatus = "partial";
        else newStatus = invoice.dueDate && new Date(invoice.dueDate) < now ? "overdue" : "unpaid";

        const datePart = now.toISOString().slice(0, 10).replace(/-/g, "");
        const prefix = `REKON-PAY-${datePart}-`;
        const [countRow] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(tenantPaymentsTable)
          .where(sql`receipt_number LIKE ${prefix + "%"}`);
        const seq = ((countRow?.count ?? 0) + 1).toString().padStart(4, "0");
        const receiptNumber = `${prefix}${seq}`;

        const [newPayment] = await tx
          .insert(tenantPaymentsTable)
          .values({
            siteId: mutation.siteId ?? undefined,
            invoiceId: invoice.id,
            tenantId: invoice.tenantId ?? undefined,
            bookingId: invoice.bookingId ?? undefined,
            tenantBookingId: invoice.bookingId ?? undefined,
            amount: String(mutAmount),
            paymentMethod: "transfer",
            paymentStatus: "PAID",
            approvalStatus: "approved",
            receiptNumber,
            paidAt: new Date(mutation.transactionDate),
            referenceNumber: mutation.providerOrderId ?? mutation.description?.slice(0, 100),
            notes: `Disetujui via rekonsiliasi bank. Mutasi ID: ${mutationId}`,
          })
          .returning({ id: tenantPaymentsTable.id });

        newPaymentId = newPayment?.id ?? null;

        await tx.update(tenantInvoicesTable)
          .set({
            paidAmount: String(newPaidAmount),
            outstandingAmount: String(outstanding),
            status: newStatus,
            updatedAt: now,
          })
          .where(eq(tenantInvoicesTable.id, invoice.id));

        updateData.matchedPaymentId = newPaymentId ?? undefined;
      }
    } else if (match.candidateType === "payment_event") {
      updateData.matchedOrderId = match.candidateId;

      await tx.update(financePaymentEventsTable)
        .set({
          paymentStatus: "confirmed",
          bankMutationId: mutationId,
          isReconciled: true,
          reconciledAt: now,
          updatedAt: now,
        })
        .where(eq(financePaymentEventsTable.id, match.candidateId));
    }

    await tx.update(bankMutationsTable)
      .set(updateData)
      .where(eq(bankMutationsTable.id, mutationId));
  });

  if (match.candidateType === "invoice" && newPaymentId) {
    await writePaymentEvent({
      sourceApp: "tenant_management",
      ownerApp: "tenant_management",
      sourceModule: "tenant_invoice",
      sourceTable: "tenant_payments",
      sourceId: newPaymentId,
      tenantId: null,
      siteId: mutation.siteId ?? null,
      invoiceId: match.candidateId,
      amount: parseFloat(String(mutation.amount)),
      direction: "IN",
      paymentMethod: "bank_transfer",
      paymentReference: mutation.providerOrderId ?? undefined,
      paymentStatus: "confirmed",
      isReconciled: true,
      reconciledAt: now,
      bankMutationId: mutationId,
      metadata: {
        mutationId,
        mutationDescription: mutation.description,
        transactionDate: mutation.transactionDate,
        approvedBy: req.user?.name ?? req.user?.email ?? "Admin",
      },
    });
  }

  const approvedByRole = (req.user as any)?.role ?? "admin";
  const approvedByApp  = "tenant_management";

  await db.update(bankMutationsTable)
    .set({ approvedByApp, approvedByRole, updatedAt: now })
    .where(eq(bankMutationsTable.id, mutationId));

  const { journalId, alreadyPosted } = await postAccountingJournal({
    mutationId,
    transactionDate: mutation.transactionDate,
    description: mutation.description,
    amount: parseFloat(String(mutation.amount)),
    direction: (mutation.direction?.toUpperCase() === "OUT" ? "OUT" : "IN") as "IN" | "OUT",
    bankAccountId: mutation.bankAccountId ?? `site-${mutation.siteId ?? 0}`,
    companyId: (mutation as any).companyId ?? null,
    ownerApp: "tenant_management",
    sourceApp: "tenant_management",
    sourceModule: "bank_reconciliation",
    createdBy: req.user?.name ?? req.user?.email ?? "Admin",
    siteId: mutation.siteId ?? null,
    metadata: {
      matchId,
      candidateType: match.candidateType,
      candidateId: match.candidateId,
      newPaymentId,
      approvedBy: req.user?.name ?? req.user?.email ?? "Admin",
    },
  });

  logAudit(req, {
    action: "bank_mutation_approved",
    entityType: "bank_mutations",
    entityId: mutationId,
    afterData: {
      matchId,
      candidateType: match.candidateType,
      candidateId: match.candidateId,
      newPaymentId,
      journalId,
      alreadyPosted,
    },
  });

  res.json({ success: true, newPaymentId, journalId, alreadyPosted });
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
  candidateType: z.enum(["payment", "invoice", "payment_event"]),
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
      eq(bankReconciliationMatchesTable.candidateId, candidateId),
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

// ── GET /bank-reconciliation/audit ───────────────────────────────────────────

router.get("/bank-reconciliation/audit", async (req, res) => {
  const siteId: number | undefined = (req as any).siteId > 0 ? (req as any).siteId : undefined;

  const siteFilter = siteId
    ? sql`AND bm.site_id = ${siteId}`
    : sql``;

  const [
    approvedWithoutJournal,
    duplicateJournals,
    approvedWithoutBalance,
    mutationsWithoutCompany,
    journalsWithoutCompany,
    overpaidInvoices,
  ] = await Promise.all([
    db.execute<{ id: number; mutation_key: string; amount: string; transaction_date: string }>(
      sql`SELECT bm.id, bm.mutation_key, bm.amount, bm.transaction_date
          FROM bank_mutations bm
          WHERE bm.status = 'approved'
            AND (bm.accounting_posted = false OR bm.accounting_posted IS NULL)
            ${siteFilter}
          ORDER BY bm.created_at DESC
          LIMIT 100`
    ),

    db.execute<{ journal_id: string; cnt: number }>(
      sql`SELECT journal_id, count(*)::int AS cnt
          FROM bank_journal_entries
          GROUP BY journal_id
          HAVING count(*) > 1
          LIMIT 50`
    ),

    db.execute<{ id: number; bank_account_id: string; site_id: number | null }>(
      sql`SELECT bm.id, bm.bank_account_id, bm.site_id
          FROM bank_mutations bm
          WHERE bm.status = 'approved'
            AND bm.accounting_posted = true
            AND bm.bank_account_id IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM bank_account_balances bab
              WHERE bab.bank_account_id = bm.bank_account_id
                AND (bab.site_id = bm.site_id OR (bab.site_id IS NULL AND bm.site_id IS NULL))
            )
            ${siteFilter}
          LIMIT 50`
    ),

    db.execute<{ id: number; mutation_key: string; status: string }>(
      sql`SELECT bm.id, bm.mutation_key, bm.status
          FROM bank_mutations bm
          WHERE bm.company_id IS NULL
            AND bm.status IN ('approved', 'matched')
            ${siteFilter}
          LIMIT 50`
    ),

    db.execute<{ id: number; journal_id: string }>(
      sql`SELECT id, journal_id
          FROM bank_journal_entries
          WHERE company_id IS NULL
          LIMIT 50`
    ),

    db.execute<{ id: number; invoice_number: string; paid_amount: string; total_amount: string }>(
      sql`SELECT id, invoice_number, paid_amount::text, total_amount::text
          FROM tenant_invoices
          WHERE paid_amount::numeric > total_amount::numeric
            AND total_amount::numeric > 0
          LIMIT 50`
    ),
  ]);

  const issues = {
    approvedWithoutJournal: {
      count: approvedWithoutJournal.rows.length,
      items: approvedWithoutJournal.rows,
    },
    duplicateJournalIds: {
      count: duplicateJournals.rows.length,
      items: duplicateJournals.rows,
    },
    approvedWithoutBalanceUpdate: {
      count: approvedWithoutBalance.rows.length,
      items: approvedWithoutBalance.rows,
    },
    mutationsWithoutCompanyId: {
      count: mutationsWithoutCompany.rows.length,
      items: mutationsWithoutCompany.rows,
    },
    journalsWithoutCompanyId: {
      count: journalsWithoutCompany.rows.length,
      items: journalsWithoutCompany.rows,
    },
    overpaidInvoices: {
      count: overpaidInvoices.rows.length,
      items: overpaidInvoices.rows,
    },
  };

  const totalIssues = Object.values(issues).reduce((sum, v) => sum + v.count, 0);

  res.json({
    ok: totalIssues === 0,
    totalIssues,
    checkedAt: new Date().toISOString(),
    issues,
  });
});

export default router;
