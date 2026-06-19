import { db } from "@workspace/db";
import { bankJournalEntriesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const COA_KAS        = { id: "1-1001", name: "Kas dan Bank" };
const COA_PENDAPATAN = { id: "4-1001", name: "Pendapatan Sewa" };
const COA_PPN        = { id: "2-1001", name: "Hutang PPN Keluaran" };

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
  const datePart = opts.transactionDate.toISOString().slice(0, 10).replace(/-/g, "");
  const journalId = `POS-${datePart}-${opts.paymentId}`;

  const [existing] = await db
    .select({ id: bankJournalEntriesTable.id })
    .from(bankJournalEntriesTable)
    .where(eq(bankJournalEntriesTable.journalId, journalId))
    .limit(1);

  const taxAmount = Math.round((opts.amountPaid * PPN_RATE) / (1 + PPN_RATE));
  const netAmount = opts.amountPaid - taxAmount;

  if (existing) {
    return { journalId, alreadyPosted: true, netAmount, taxAmount };
  }

  const transactionDateStr = opts.transactionDate.toISOString().slice(0, 10);
  const description =
    `POS Payment — ${opts.businessName ?? `Tenant #${opts.tenantId}`}` +
    (opts.invoiceNumber ? ` — ${opts.invoiceNumber}` : "") +
    ` — ${opts.receiptNumber}`;

  await db.insert(bankJournalEntriesTable).values({
    journalId,
    mutationId: null,
    ownerApp: "tenant_management",
    sourceApp: "tenant_pos",
    sourceModule: "pos_payment",
    transactionDate: transactionDateStr,
    description,
    debitAccountId: COA_KAS.id,
    debitAccountName: COA_KAS.name,
    creditAccountId: COA_PENDAPATAN.id,
    creditAccountName: COA_PENDAPATAN.name,
    debitAmount: String(opts.amountPaid),
    creditAmount: String(netAmount),
    taxAmount: String(taxAmount),
    taxAccountId: COA_PPN.id,
    taxAccountName: COA_PPN.name,
    currency: "IDR",
    status: "posted",
    createdBy: opts.kasirName ?? null,
    siteId: opts.siteId ?? null,
    metadata: {
      paymentId: opts.paymentId,
      tenantId: opts.tenantId,
      invoiceId: opts.invoiceId ?? null,
      invoiceNumber: opts.invoiceNumber ?? null,
      receiptNumber: opts.receiptNumber,
      paymentMethod: opts.paymentMethod,
      ppnRate: PPN_RATE,
    },
  });

  return { journalId, alreadyPosted: false, netAmount, taxAmount };
}
