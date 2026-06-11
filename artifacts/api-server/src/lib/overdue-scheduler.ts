import { db } from "@workspace/db";
import { tenantInvoicesTable, tenantsTable } from "@workspace/db/schema";
import { and, inArray, isNull, eq, sql } from "drizzle-orm";
import { sendOverdueReminder, sendInvoiceNotification } from "./whatsapp";
import { logger } from "./logger";

let _started = false;

export function startOverdueScheduler(): void {
  if (_started) return;
  _started = true;

  // Jalankan semua pengecekan 30 detik setelah startup
  setTimeout(() => {
    runDueReminderCheck().catch((err) =>
      logger.warn({ err }, "[scheduler] Cek reminder H-3/H-1 awal gagal"),
    );
    runOverdueCheck().catch((err) =>
      logger.warn({ err }, "[scheduler] Cek overdue awal gagal"),
    );
  }, 30_000);

  // Ulangi setiap 12 jam
  setInterval(
    () => {
      runDueReminderCheck().catch((err) =>
        logger.warn({ err }, "[scheduler] Cek reminder H-3/H-1 berkala gagal"),
      );
      runOverdueCheck().catch((err) =>
        logger.warn({ err }, "[scheduler] Cek overdue berkala gagal"),
      );
    },
    12 * 60 * 60 * 1000,
  );

  logger.info("[scheduler] Scheduler aktif (H-3, H-1, overdue) — cek setiap 12 jam");
}

// ─── Helper: bangun payment link ─────────────────────────────────────────────

function buildPaymentLink(token: string | null | undefined): string | undefined {
  if (!token) return undefined;
  const domain =
    process.env.REPLIT_DEV_DOMAIN ??
    process.env.REPLIT_DOMAINS?.split(",")[0] ??
    process.env.APP_URL;
  return domain ? `https://${domain}/bayar/${token}` : undefined;
}

// ─── Helper: format label periode ────────────────────────────────────────────

function formatPeriodLabel(
  periodStart: string | null | undefined,
  periodEnd: string | null | undefined,
): string {
  if (!periodStart && !periodEnd) return "-";
  const fmt = (d: string) =>
    new Date(d).toLocaleDateString("id-ID", { month: "long", year: "numeric" });
  if (periodStart && periodEnd) return `${fmt(periodStart)} – ${fmt(periodEnd)}`;
  return fmt((periodStart ?? periodEnd)!);
}

// ─── H-3 dan H-1: Reminder sebelum jatuh tempo ───────────────────────────────

/**
 * Kirim WA pengingat 3 hari (H-3) dan 1 hari (H-1) sebelum jatuh tempo.
 * Menggunakan template sendInvoiceNotification — menyertakan link bayar.
 * Kolom dueReminder3dAt / dueReminder1dAt diset agar tidak kirim ulang.
 */
async function runDueReminderCheck(): Promise<void> {
  logger.info("[scheduler] Menjalankan cek reminder H-3 / H-1...");

  const now = new Date();

  const selectFields = {
    id: tenantInvoicesTable.id,
    invoiceNumber: tenantInvoicesTable.invoiceNumber,
    dueDate: tenantInvoicesTable.dueDate,
    periodStart: tenantInvoicesTable.periodStart,
    periodEnd: tenantInvoicesTable.periodEnd,
    totalAmount: tenantInvoicesTable.totalAmount,
    outstandingAmount: tenantInvoicesTable.outstandingAmount,
    paymentToken: tenantInvoicesTable.paymentToken,
    ownerName: tenantsTable.ownerName,
    businessName: tenantsTable.businessName,
    phone: tenantsTable.phone,
  } as const;

  const baseWhere = inArray(tenantInvoicesTable.status, ["unpaid", "partial"]);

  // H-3: jatuh tempo 3 hari lagi, belum dikirim
  const h3Invoices = await db
    .select(selectFields)
    .from(tenantInvoicesTable)
    .innerJoin(tenantsTable, eq(tenantInvoicesTable.tenantId, tenantsTable.id))
    .where(
      and(
        baseWhere,
        isNull(tenantInvoicesTable.dueReminder3dAt),
        sql`"due_date" = CURRENT_DATE + INTERVAL '3 days'`,
      ),
    );

  // H-1: jatuh tempo besok, belum dikirim
  const h1Invoices = await db
    .select(selectFields)
    .from(tenantInvoicesTable)
    .innerJoin(tenantsTable, eq(tenantInvoicesTable.tenantId, tenantsTable.id))
    .where(
      and(
        baseWhere,
        isNull(tenantInvoicesTable.dueReminder1dAt),
        sql`"due_date" = CURRENT_DATE + INTERVAL '1 day'`,
      ),
    );

  logger.info(
    { h3: h3Invoices.length, h1: h1Invoices.length },
    "[scheduler] Invoice perlu reminder",
  );

  let sentH3 = 0;
  let sentH1 = 0;

  for (const invoice of h3Invoices) {
    await db
      .update(tenantInvoicesTable)
      .set({ dueReminder3dAt: now, updatedAt: now })
      .where(eq(tenantInvoicesTable.id, invoice.id));

    if (invoice.phone) {
      const dueStr = invoice.dueDate
        ? new Date(invoice.dueDate).toLocaleDateString("id-ID", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })
        : "-";

      const result = await sendInvoiceNotification({
        ownerName: invoice.ownerName,
        businessName: invoice.businessName,
        invoiceNumber: invoice.invoiceNumber,
        periodLabel: formatPeriodLabel(invoice.periodStart, invoice.periodEnd),
        totalAmount: invoice.outstandingAmount ?? invoice.totalAmount,
        dueDate: dueStr,
        phone: invoice.phone,
        paymentLink: buildPaymentLink(invoice.paymentToken),
      });

      if (result.ok && !result.skipped) sentH3++;
    }
  }

  for (const invoice of h1Invoices) {
    await db
      .update(tenantInvoicesTable)
      .set({ dueReminder1dAt: now, updatedAt: now })
      .where(eq(tenantInvoicesTable.id, invoice.id));

    if (invoice.phone) {
      const dueStr = invoice.dueDate
        ? new Date(invoice.dueDate).toLocaleDateString("id-ID", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })
        : "-";

      const result = await sendInvoiceNotification({
        ownerName: invoice.ownerName,
        businessName: invoice.businessName,
        invoiceNumber: invoice.invoiceNumber,
        periodLabel: formatPeriodLabel(invoice.periodStart, invoice.periodEnd),
        totalAmount: invoice.outstandingAmount ?? invoice.totalAmount,
        dueDate: dueStr,
        phone: invoice.phone,
        paymentLink: buildPaymentLink(invoice.paymentToken),
      });

      if (result.ok && !result.skipped) sentH3++;
      if (result.ok && !result.skipped) sentH1++;
    }
  }

  logger.info(
    { sentH3, sentH1 },
    "[scheduler] Pengingat WA H-3/H-1 selesai",
  );
}

// ─── Overdue Reminder (sudah melewati jatuh tempo) ───────────────────────────

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
        sql`"due_date" < CURRENT_DATE`,
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
