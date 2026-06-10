import { db } from "@workspace/db";
import { tenantInvoicesTable, tenantsTable } from "@workspace/db/schema";
import { and, inArray, isNull, eq, sql } from "drizzle-orm";
import { sendOverdueReminder } from "./whatsapp";
import { logger } from "./logger";

let _started = false;

export function startOverdueScheduler(): void {
  if (_started) return;
  _started = true;

  setTimeout(() => {
    runOverdueCheck().catch((err) =>
      logger.warn({ err }, "[scheduler] Cek overdue awal gagal"),
    );
  }, 30_000);

  setInterval(
    () => {
      runOverdueCheck().catch((err) =>
        logger.warn({ err }, "[scheduler] Cek overdue berkala gagal"),
      );
    },
    12 * 60 * 60 * 1000,
  );

  logger.info("[scheduler] Overdue scheduler aktif — cek setiap 12 jam");
}

async function runOverdueCheck(): Promise<void> {
  logger.info("[scheduler] Menjalankan cek invoice jatuh tempo...");

  const overdueInvoices = await db
    .select({
      id: tenantInvoicesTable.id,
      invoiceNumber: tenantInvoicesTable.invoiceNumber,
      dueDate: tenantInvoicesTable.dueDate,
      totalAmount: tenantInvoicesTable.totalAmount,
      outstandingAmount: tenantInvoicesTable.outstandingAmount,
      ownerName: tenantsTable.ownerName,
      businessName: tenantsTable.businessName,
      phone: tenantsTable.phone,
    })
    .from(tenantInvoicesTable)
    .innerJoin(tenantsTable, eq(tenantInvoicesTable.tenantId, tenantsTable.id))
    .where(
      and(
        inArray(tenantInvoicesTable.status, ["unpaid", "partial"]),
        isNull(tenantInvoicesTable.lastOverdueReminderAt),
        sql`due_date < CURRENT_DATE`,
      ),
    );

  if (overdueInvoices.length === 0) {
    logger.info("[scheduler] Tidak ada invoice baru yang jatuh tempo");
    return;
  }

  logger.info(
    { count: overdueInvoices.length },
    "[scheduler] Ditemukan invoice baru jatuh tempo",
  );

  let sent = 0;

  for (const invoice of overdueInvoices) {
    await db
      .update(tenantInvoicesTable)
      .set({
        status: "overdue",
        lastOverdueReminderAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(tenantInvoicesTable.id, invoice.id));

    if (invoice.phone) {
      const dueDate = invoice.dueDate ? new Date(invoice.dueDate) : null;
      const daysOverdue = dueDate
        ? Math.max(0, Math.floor((Date.now() - dueDate.getTime()) / 86400000))
        : 0;

      const result = await sendOverdueReminder({
        ownerName: invoice.ownerName,
        businessName: invoice.businessName,
        invoiceNumber: invoice.invoiceNumber,
        totalAmount: invoice.totalAmount,
        outstandingAmount: invoice.outstandingAmount ?? invoice.totalAmount,
        daysOverdue,
        phone: invoice.phone,
      });

      if (result.ok && !result.skipped) sent++;
    }
  }

  logger.info(
    { sent, total: overdueInvoices.length },
    "[scheduler] Pengingat WA overdue selesai",
  );
}
