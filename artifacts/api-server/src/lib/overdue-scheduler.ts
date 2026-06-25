import { db } from "@workspace/db";
import { tenantInvoicesTable, tenantsTable, usersTable, bankMutationsTable } from "@workspace/db/schema";
import { and, inArray, isNull, eq, sql, gt } from "drizzle-orm";
import { sendOverdueReminder, sendDueReminder, sendBankUnmatchedAlert } from "./whatsapp";
import { logger } from "./logger";
import { getBaseUrl } from "./app-url";

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
    runUnmatchedMutationCheck().catch((err) =>
      logger.warn({ err }, "[scheduler] Cek mutasi unmatched awal gagal"),
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
      runUnmatchedMutationCheck().catch((err) =>
        logger.warn({ err }, "[scheduler] Cek mutasi unmatched berkala gagal"),
      );
    },
    12 * 60 * 60 * 1000,
  );

  logger.info("[scheduler] Scheduler aktif (H-3, H-1, overdue, unmatched) — cek setiap 12 jam");
}

// ─── Helper: ambil admin yang punya nomor HP ───────────────────────────────────

async function getAdminPhones(): Promise<Array<{ name: string; phone: string }>> {
  const adminWa = process.env.FONNTE_ADMIN_WA;
  const admins = await db
    .select({ name: usersTable.name, phoneNumber: usersTable.phoneNumber })
    .from(usersTable)
    .where(
      and(
        inArray(usersTable.role, ["owner", "admin", "finance"]),
        eq(usersTable.status, "active"),
        sql`phone_number IS NOT NULL AND phone_number != ''`,
      ),
    );

  const result = admins
    .filter((u) => u.phoneNumber)
    .map((u) => ({ name: u.name, phone: u.phoneNumber! }));

  // Fallback ke FONNTE_ADMIN_WA jika tidak ada admin dengan HP terdaftar
  if (result.length === 0 && adminWa) {
    result.push({ name: "Admin", phone: adminWa });
  }

  return result;
}

/**
 * Kirim notifikasi ringkasan hasil import mutasi ke semua admin/owner/finance.
 * Dipanggil langsung dari endpoint import bank reconciliation.
 */
export async function notifyAdminsUnmatchedImport(params: {
  totalImported: number;
  unmatchedCount: number;
  autoMatchedCount: number;
  duplicateCount: number;
  bankAccountId?: string;
  source: "import_csv" | "import_sheet";
}): Promise<void> {
  if (params.unmatchedCount === 0 && params.duplicateCount === 0) return;

  try {
    const admins = await getAdminPhones();
    if (admins.length === 0) return;

    logger.info(
      { admins: admins.length, unmatched: params.unmatchedCount },
      "[wa] Mengirim notifikasi import mutasi unmatched",
    );

    await Promise.allSettled(
      admins.map((admin) =>
        sendBankUnmatchedAlert({
          adminName: admin.name,
          adminPhone: admin.phone,
          totalImported: params.totalImported,
          unmatchedCount: params.unmatchedCount,
          autoMatchedCount: params.autoMatchedCount,
          duplicateCount: params.duplicateCount,
          bankAccountId: params.bankAccountId,
          source: params.source,
        }),
      ),
    );
  } catch (err) {
    logger.warn({ err }, "[wa] Gagal kirim notifikasi mutasi unmatched");
  }
}

// ─── Helper: bangun payment link ─────────────────────────────────────────────

async function buildPaymentLink(token: string | null | undefined): Promise<string | undefined> {
  if (!token) return undefined;
  const base = await getBaseUrl();
  return base ? `${base}/bayar/${token}` : undefined;
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

      const result = await sendDueReminder({
        ownerName: invoice.ownerName,
        businessName: invoice.businessName,
        invoiceNumber: invoice.invoiceNumber,
        periodLabel: formatPeriodLabel(invoice.periodStart, invoice.periodEnd),
        totalAmount: invoice.totalAmount,
        outstandingAmount: invoice.outstandingAmount,
        dueDate: dueStr,
        daysUntilDue: 3,
        phone: invoice.phone,
        paymentLink: await buildPaymentLink(invoice.paymentToken),
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

      const result = await sendDueReminder({
        ownerName: invoice.ownerName,
        businessName: invoice.businessName,
        invoiceNumber: invoice.invoiceNumber,
        periodLabel: formatPeriodLabel(invoice.periodStart, invoice.periodEnd),
        totalAmount: invoice.totalAmount,
        outstandingAmount: invoice.outstandingAmount,
        dueDate: dueStr,
        daysUntilDue: 1,
        phone: invoice.phone,
        paymentLink: await buildPaymentLink(invoice.paymentToken),
      });

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
      paymentToken: tenantInvoicesTable.paymentToken,
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
        paymentLink: await buildPaymentLink(invoice.paymentToken),
      });

      if (result.ok && !result.skipped) sent++;
    }
  }

  logger.info(
    { sent, total: overdueInvoices.length },
    "[scheduler] Pengingat WA overdue selesai",
  );
}

// ─── Unmatched Mutation Check (periodik setiap 12 jam) ────────────────────────

// Rate-limit: simpan waktu terakhir notifikasi agar tidak spam
let _lastUnmatchedNotifAt: Date | null = null;

async function runUnmatchedMutationCheck(): Promise<void> {
  logger.info("[scheduler] Menjalankan cek mutasi bank unmatched...");

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(bankMutationsTable)
    .where(
      and(
        inArray(bankMutationsTable.status, ["unmatched", "duplicate_need_review"]),
        // Hanya mutasi yang sudah lebih dari 1 jam (beri waktu proses auto-match)
        sql`created_at < NOW() - INTERVAL '1 hour'`,
      ),
    );

  if (count === 0) {
    logger.info("[scheduler] Tidak ada mutasi unmatched yang perlu direview");
    return;
  }

  // Rate-limit: jangan kirim jika sudah kirim dalam 12 jam terakhir
  const now = new Date();
  if (_lastUnmatchedNotifAt) {
    const hoursSinceLast = (now.getTime() - _lastUnmatchedNotifAt.getTime()) / (60 * 60 * 1000);
    if (hoursSinceLast < 12) {
      logger.info(
        { count, hoursSinceLast: hoursSinceLast.toFixed(1) },
        "[scheduler] Notifikasi mutasi unmatched dilewati (rate-limit)",
      );
      return;
    }
  }

  logger.info({ count }, "[scheduler] Ditemukan mutasi bank yang belum cocok, kirim notifikasi WA");

  const admins = await getAdminPhones();
  if (admins.length === 0) {
    logger.info("[scheduler] Tidak ada admin dengan nomor HP untuk dikirim notifikasi");
    return;
  }

  _lastUnmatchedNotifAt = now;

  const results = await Promise.allSettled(
    admins.map((admin) =>
      sendBankUnmatchedAlert({
        adminName: admin.name,
        adminPhone: admin.phone,
        totalImported: count,
        unmatchedCount: count,
        autoMatchedCount: 0,
        duplicateCount: 0,
        source: "scheduler",
      }),
    ),
  );

  const sent = results.filter(
    (r) => r.status === "fulfilled" && (r.value as any).ok && !(r.value as any).skipped,
  ).length;

  logger.info(
    { count, sent, total: admins.length },
    "[scheduler] Notifikasi WA mutasi unmatched selesai",
  );
}
