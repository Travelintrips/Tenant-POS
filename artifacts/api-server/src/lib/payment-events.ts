import { db } from "@workspace/db";
import { financePaymentEventsTable } from "@workspace/db/schema";
import { and, eq, sql } from "drizzle-orm";

export interface WritePaymentEventInput {
  sourceApp: string;
  ownerApp: string;
  sourceModule: string;
  sourceTable: string;
  sourceId: number;
  ownerCompanyId?: number | null;
  ownerTenantId?: number | null;
  tenantId?: number | null;
  siteId?: number | null;
  invoiceId?: number | null;
  amount: number;
  direction?: string;
  paymentMethod: string;
  paymentReference?: string | null;
  externalOrderId?: string | null;
  paymentStatus: string;
  proofUrl?: string | null;
  bankMutationId?: number | null;
  isReconciled?: boolean;
  reconciledAt?: Date | null;
  metadata?: Record<string, unknown> | null;
}

export async function writePaymentEvent(input: WritePaymentEventInput): Promise<void> {
  try {
    const existing = await db
      .select({ id: financePaymentEventsTable.id })
      .from(financePaymentEventsTable)
      .where(
        and(
          eq(financePaymentEventsTable.sourceApp, input.sourceApp),
          eq(financePaymentEventsTable.sourceTable, input.sourceTable),
          eq(financePaymentEventsTable.sourceId, input.sourceId),
          sql`ABS(${financePaymentEventsTable.amount}::numeric - ${input.amount}) < 1`,
          eq(financePaymentEventsTable.direction, input.direction ?? "IN"),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(financePaymentEventsTable)
        .set({
          paymentStatus: input.paymentStatus,
          bankMutationId: input.bankMutationId ?? null,
          isReconciled: input.isReconciled ?? false,
          reconciledAt: input.reconciledAt ?? null,
          proofUrl: input.proofUrl ?? null,
          updatedAt: new Date(),
        })
        .where(eq(financePaymentEventsTable.id, existing[0].id));
      return;
    }

    await db.insert(financePaymentEventsTable).values({
      sourceApp: input.sourceApp,
      ownerApp: input.ownerApp,
      sourceModule: input.sourceModule,
      sourceTable: input.sourceTable,
      sourceId: input.sourceId,
      ownerCompanyId: input.ownerCompanyId ?? null,
      ownerTenantId: input.ownerTenantId ?? null,
      tenantId: input.tenantId ?? null,
      siteId: input.siteId ?? null,
      invoiceId: input.invoiceId ?? null,
      amount: String(input.amount),
      direction: input.direction ?? "IN",
      paymentMethod: input.paymentMethod,
      paymentReference: input.paymentReference ?? null,
      externalOrderId: input.externalOrderId ?? null,
      paymentStatus: input.paymentStatus,
      proofUrl: input.proofUrl ?? null,
      bankMutationId: input.bankMutationId ?? null,
      isReconciled: input.isReconciled ?? false,
      reconciledAt: input.reconciledAt ?? null,
      metadata: input.metadata ?? null,
    });
  } catch (err) {
    console.error("[writePaymentEvent] Gagal menulis payment event:", err);
  }
}

export function normalizePaymentMethod(method: string): string {
  const m = method.toLowerCase();
  if (m === "transfer") return "bank_transfer";
  if (m === "tunai") return "cash";
  return m;
}
