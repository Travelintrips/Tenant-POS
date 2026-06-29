import { db } from "@workspace/db";
import { tenantInvoicesTable, tenantsTable, bankMutationsTable } from "@workspace/db/schema";
import { and, inArray, isNull, eq, sql } from "drizzle-orm";
import { sendInvoiceNotification, sendOverdueReminder, sendDueReminder, sendBankUnmatchedAlert, getAdminNotifyPhones, getSiteCompanyName } from "./whatsapp";
import { logger } from "./logger";
import { getBaseUrl } from "./app-url";

let _started = false;

// Jam eksekusi scheduler (dalam WIB = UTC+7, diperhitungkan sbg UTC)
// Cek dilakukan 2x sehari: jam 06:00 WIB (23:00 UTC) dan jam 18:00 WIB (11:00 UTC)
const SCHEDULE_HOURS_UTC = [23, 11]; // 23 UTC = 06:00 WIB, 11 UTC = 18:00 WIB

let _lastRunDateKey = ""; // format: "YYYY-MM-DD-HH"

async function runAllChecks(label: string): Promise<void> {
  logger.info(`[scheduler] Menjalankan semua pengecekan (${label})...`);
  await Promise.allSettled([
    runInvoiceNotificationCheck().catch((err) =>
      logger.warn({ err }, "[scheduler] Cek kirim tagihan gagal"),
    ),
    runDueReminderCheck().catch((err) =>
      logger.warn({ err }, "[scheduler] Cek reminder H-7/H-3/H-1 gagal"),
    ),
    runOverdueCheck().catch((err) =>
      logger.warn({ err }, "[scheduler] Cek overdue gagal"),
    ),
    runUnmatchedMutationCheck().catch((err) =>
      logger.warn({ err }, "[scheduler] Cek mutasi unmatched gagal"),
    ),
  ]);
}

export function startOverdueScheduler(): void {
  if (_started) return;
  _started = true;

  // Jalankan sekali 30 detik setelah startup (catch-up jika server baru restart)
  setTimeout(
    () => runAllChecks("startup").catch(() => {}),
    30_000,
  );

  // Cron sederhana: cek setiap 5 menit, eksekusi jika jam-nya tepat
  // Ini memastikan scheduler berjalan pada jam yang terprediksi (06:00 dan 18:00 WIB)
  // meski server restart kapan saja
  setInterval(() => {
    const now = new Date();
    const hourUtc = now.getUTCHours();
    const dateKey = `${now.toISOString().slice(0, 10)}-${hourUtc}`;

    // Hanya eksekusi jika jam-nya sesuai jadwal DAN belum dijalankan di jam ini
    if (SCHEDULE_HOURS_UTC.includes(hourUtc) && dateKey !== _lastRunDateKey) {
      _lastRunDateKey = dateKey;
      runAllChecks(`cron ${hourUtc}:00 UTC`).catch(() => {});
    }
  }, 5 * 60 * 1000); // setiap 5 menit

  logger.info(
    "[scheduler] Scheduler aktif — cron 06:00 & 18:00 WIB (tagihan, H-7, H-3, H-1, overdue, unmatched)",
  );
}

// getAdminPhones → pakai getAdminNotifyPhones() dari whatsapp.ts (sudah handle ADMIN_WA_GROUP)

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
    const admins = await getAdminNotifyPhones();
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

// ─── Kirim tagihan di awal periode sewa ──────────────────────────────────────

/**
 * Kirim WA tagihan baru ke tenant di awal setiap periode sewa.
 * Invoice yang period_start-nya hari ini atau sudah lewat (maks 3 hari lalu)
 * dan belum pernah dikirimkan notifikasinya (invoice_notified_at IS NULL)
 * akan dikirim sekarang.
 */
async function runInvoiceNotificationCheck(): Promise<void> {
  logger.info("[scheduler] Menjalankan cek kirim tagihan awal periode...");

  const invoices = await db
    .select({
      id: tenantInvoicesTable.id,
      invoiceNumber: tenantInvoicesTable.invoiceNumber,
      siteId: tenantInvoicesTable.siteId,
      periodStart: tenantInvoicesTable.periodStart,
      periodEnd: tenantInvoicesTable.periodEnd,
      dueDate: tenantInvoicesTable.dueDate,
      totalAmount: tenantInvoicesTable.totalAmount,
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
        isNull(tenantInvoicesTable.invoiceNotifiedAt),
        // Periode mulai hari ini atau maks 3 hari yang lalu (catch-up)
        sql`"period_start" BETWEEN CURRENT_DATE - INTERVAL '3 days' AND CURRENT_DATE`,
      ),
    );

  logger.info({ count: invoices.length }, "[scheduler] Invoice baru perlu dikirim ke tenant");

  let sent = 0;

  for (const invoice of invoices) {
    const now = new Date();

    // Tandai sudah dikirim dulu agar tidak dobel walau WA gagal
    await db
      .update(tenantInvoicesTable)
      .set({ invoiceNotifiedAt: now, updatedAt: now })
      .where(eq(tenantInvoicesTable.id, invoice.id));

    if (invoice.phone) {
      const dueStr = invoice.dueDate
        ? new Date(invoice.dueDate).toLocaleDateString("id-ID", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })
        : "-";

      const companyName = await getSiteCompanyName(invoice.siteId);
      const paymentLink = await buildPaymentLink(invoice.paymentToken);

      const result = await sendInvoiceNotification({
        ownerName: invoice.ownerName,
        businessName: invoice.businessName,
        invoiceNumber: invoice.invoiceNumber,
        periodLabel: formatPeriodLabel(invoice.periodStart, invoice.periodEnd),
        totalAmount: invoice.totalAmount,
        dueDate: dueStr,
        phone: invoice.phone,
        paymentLink,
        companyName,
      });

      if (result.ok && !result.skipped) sent++;
    }
  }

  logger.info({ sent, total: invoices.length }, "[scheduler] Pengiriman tagihan awal periode selesai");
}

// ─── H-3 dan H-1: Reminder sebelum jatuh tempo ───────────────────────────────

/**
 * Kirim WA pengingat 7 hari (H-7), 3 hari (H-3), dan 1 hari (H-1) sebelum jatuh tempo.
 * Menggunakan template sendInvoiceNotification — menyertakan link bayar.
 * Kolom dueReminder7dAt / dueReminder3dAt / dueReminder1dAt diset agar tidak kirim ulang.
 */
async function runDueReminderCheck(): Promise<void> {
  logger.info("[scheduler] Menjalankan cek reminder H-7 / H-3 / H-1...");

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

  // H-7: jatuh tempo 7 hari lagi, belum dikirim
  const h7Invoices = await db
    .select(selectFields)
    .from(tenantInvoicesTable)
    .innerJoin(tenantsTable, eq(tenantInvoicesTable.tenantId, tenantsTable.id))
    .where(
      and(
        baseWhere,
        isNull(tenantInvoicesTable.dueReminder7dAt),
        sql`"due_date" = CURRENT_DATE + INTERVAL '7 days'`,
      ),
    );

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
    { h7: h7Invoices.length, h3: h3Invoices.length, h1: h1Invoices.length },
    "[scheduler] Invoice perlu reminder",
  );

  let sentH7 = 0;
  let sentH3 = 0;
  let sentH1 = 0;

  for (const invoice of h7Invoices) {
    await db
      .update(tenantInvoicesTable)
      .set({ dueReminder7dAt: now, updatedAt: now })
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
        daysUntilDue: 7,
        phone: invoice.phone,
        paymentLink: await buildPaymentLink(invoice.paymentToken),
      });

      if (result.ok && !result.skipped) sentH7++;
    }
  }

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
    { sentH7, sentH3, sentH1 },
    "[scheduler] Pengingat WA H-7/H-3/H-1 selesai",
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

  const admins = await getAdminNotifyPhones();
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
