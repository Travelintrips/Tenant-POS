import { db } from "@workspace/db";
import { tenantInvoicesTable, tenantsTable, bankMutationsTable } from "@workspace/db/schema";
import { and, inArray, isNull, eq, sql } from "drizzle-orm";
import { createAllInvoicesForBooking } from "./auto-invoice";
import { sendInvoiceNotification, sendOverdueReminder, sendDueReminder, getAdminNotifyPhones, getSiteCompanyName, notifyAdminGroup } from "./whatsapp";
import { logger } from "./logger";
import { getBaseUrl } from "./app-url";

let _started = false;

// Jam eksekusi scheduler (dalam WIB = UTC+7, diperhitungkan sbg UTC)
// Cek dilakukan 2x sehari:
//   01 UTC = 08:00 WIB  → blast tagihan awal bulan + reminder + overdue (utama)
//   11 UTC = 18:00 WIB  → pengecekan sore (reminder + overdue saja, invoice sudah terkirim pagi)
const SCHEDULE_HOURS_UTC = [1, 11]; // 01 UTC = 08:00 WIB, 11 UTC = 18:00 WIB

let _lastRunDateKey = ""; // format: "YYYY-MM-DD-HH"

// ─── Status tracker (diakses oleh route /blast-tagihan/status) ────────────────

export interface BlastRun {
  runAt: string;
  label: string;
  invoicesCreated: number;
  invoicesSent: number;
  reminderH7: number;
  reminderH3: number;
  reminderH1: number;
  overdueSent: number;
}

export interface BlastStatus {
  lastRunAt: string | null;
  lastRunLabel: string | null;
  lastResult: {
    invoicesCreated: number;
    invoiceSent: number;
    reminderH7: number;
    reminderH3: number;
    reminderH1: number;
    overdueSent: number;
  } | null;
  nextScheduledHoursUtc: number[];
  isRunning: boolean;
}

let _blastStatus: BlastStatus = {
  lastRunAt: null,
  lastRunLabel: null,
  lastResult: null,
  nextScheduledHoursUtc: SCHEDULE_HOURS_UTC,
  isRunning: false,
};

let _blastHistory: BlastRun[] = [];

export function getBlastStatus(): BlastStatus {
  return { ..._blastStatus };
}

export function getBlastHistory(): BlastRun[] {
  return [..._blastHistory];
}

async function runAllChecks(label: string): Promise<void> {
  if (_blastStatus.isRunning) {
    logger.info("[scheduler] Pengecekan sedang berjalan, dilewati");
    return;
  }
  _blastStatus.isRunning = true;
  const runAt = new Date().toISOString();
  logger.info(`[scheduler] Menjalankan semua pengecekan (${label})...`);
  try {
    // 1. Buat invoice bulanan terlebih dahulu (idempotent)
    const invoicesCreated = await runMonthlyInvoiceGeneration().catch((err) => {
      logger.warn({ err }, "[scheduler] Pembuatan invoice bulanan gagal");
      return 0;
    });

    // 2. Kirim notifikasi WA secara paralel
    const [invoicesSent, dueResult, overdueSent] = await Promise.all([
      runInvoiceNotificationCheck().catch((err) => {
        logger.warn({ err }, "[scheduler] Cek kirim tagihan gagal");
        return 0;
      }),
      runDueReminderCheck().catch((err) => {
        logger.warn({ err }, "[scheduler] Cek reminder H-7/H-3/H-1 gagal");
        return { h7: 0, h3: 0, h1: 0 };
      }),
      runOverdueCheck().catch((err) => {
        logger.warn({ err }, "[scheduler] Cek overdue gagal");
        return 0;
      }),
    ]);


    const result = {
      invoicesCreated,
      invoiceSent: invoicesSent,
      reminderH7: dueResult.h7,
      reminderH3: dueResult.h3,
      reminderH1: dueResult.h1,
      overdueSent,
    };

    _blastStatus.lastRunAt = runAt;
    _blastStatus.lastRunLabel = label;
    _blastStatus.lastResult = result;

    // Simpan ke history (maks 20 entri)
    _blastHistory.unshift({
      runAt,
      label,
      invoicesCreated,
      invoicesSent,
      reminderH7: dueResult.h7,
      reminderH3: dueResult.h3,
      reminderH1: dueResult.h1,
      overdueSent,
    });
    if (_blastHistory.length > 20) _blastHistory.pop();
  } finally {
    _blastStatus.isRunning = false;
  }
}

/**
 * Trigger blast tagihan manual (dari API endpoint).
 * Menjalankan runInvoiceNotificationCheck + runDueReminderCheck + runOverdueCheck.
 */
export async function runManualBlast(label: string): Promise<void> {
  await runAllChecks(label);
}

export function startOverdueScheduler(): void {
  if (_started) return;
  _started = true;

  // Startup catch-up: hanya BUAT invoice (idempoten), TIDAK kirim notifikasi WA.
  // Ini penting agar server restart kapan saja (termasuk jam 04:00 pagi) tidak
  // langsung mengirim blast ke seluruh tenant di luar jam terjadwal.
  // Notifikasi WA hanya dikirim oleh cron di jam 01 UTC (08:00 WIB).
  setTimeout(async () => {
    try {
      logger.info("[scheduler] Startup: membuat invoice bulanan (tanpa kirim WA)...");
      const created = await runMonthlyInvoiceGeneration();
      logger.info({ created }, "[scheduler] Startup selesai — invoice generation only");
    } catch (err) {
      logger.warn({ err }, "[scheduler] Startup invoice generation gagal");
    }
  }, 30_000);

  // Cron sederhana: cek setiap 5 menit, eksekusi jika jam-nya tepat.
  // Hanya 2 jam terjadwal:
  //   01 UTC = 08:00 WIB → blast tagihan + reminder + overdue (utama)
  //   11 UTC = 18:00 WIB → reminder + overdue sore
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
    "[scheduler] Scheduler aktif — cron 08:00 WIB (01 UTC) dan 18:00 WIB (11 UTC). " +
    "Startup hanya generate invoice, notifikasi WA hanya di jam terjadwal.",
  );
}

// getAdminPhones → pakai getAdminNotifyPhones() dari whatsapp.ts (sudah handle ADMIN_WA_GROUP)

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

// ─── Pembuatan invoice bulanan otomatis ──────────────────────────────────────

/**
 * Buat invoice bulanan untuk semua booking aktif yang belum punya invoice bulan ini.
 * Fungsi ini idempotent — aman dipanggil setiap hari karena createAllInvoicesForBooking
 * menggunakan ON CONFLICT DO NOTHING (tidak duplikat invoice yang sudah ada).
 * @returns Jumlah invoice baru yang berhasil dibuat.
 */
async function runMonthlyInvoiceGeneration(): Promise<number> {
  logger.info("[scheduler] Menjalankan pembuatan invoice bulanan otomatis...");

  const result = await db.execute(sql`
    SELECT
      b.id,
      b.site_id,
      b.tenant_id,
      b.unit_code,
      b.start_date,
      b.end_date,
      b.duration_months,
      b.rent_amount
    FROM tenant_bookings b
    WHERE
      b.booking_status IN ('aktif', 'active')
      AND b.contract_status NOT IN ('expired', 'terminated')
      AND COALESCE(b.rent_amount::numeric, 0) > 0
      AND (b.start_date IS NULL OR b.start_date::date <= CURRENT_DATE)
      AND (
        b.end_date IS NULL
        OR b.end_date::date >= DATE_TRUNC('month', CURRENT_DATE)::date
      )
  `);

  const rows = (result as unknown as {
    rows: Array<{
      id: number;
      site_id: number;
      tenant_id: number;
      unit_code: string | null;
      start_date: string | null;
      end_date: string | null;
      duration_months: number | null;
      rent_amount: string | null;
    }>;
  }).rows;

  logger.info({ count: rows.length }, "[scheduler] Booking aktif ditemukan untuk pembuatan invoice");

  let totalCreated = 0;

  for (const b of rows) {
    if (!b.start_date) continue;

    let durationMonths = Number(b.duration_months ?? 0);
    if (!durationMonths && b.end_date) {
      const s = new Date(b.start_date + "T00:00:00Z");
      const e = new Date(b.end_date + "T00:00:00Z");
      durationMonths =
        (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1;
    }
    if (durationMonths <= 0) continue;

    const rentAmount = Number(b.rent_amount ?? 0);
    if (rentAmount <= 0) continue;

    try {
      const ids = await createAllInvoicesForBooking({
        bookingId: b.id,
        siteId: b.site_id,
        tenantId: b.tenant_id,
        unitCode: b.unit_code ?? null,
        rentAmount,
        startDate: b.start_date,
        durationMonths,
      });
      totalCreated += ids.length;
    } catch (err) {
      logger.warn({ err, bookingId: b.id }, "[scheduler] Gagal buat invoice untuk booking");
    }
  }

  logger.info(
    { bookings: rows.length, newInvoices: totalCreated },
    "[scheduler] Pembuatan invoice bulanan selesai",
  );

  return totalCreated;
}

// ─── Kirim tagihan di awal periode sewa ──────────────────────────────────────

/**
 * Kirim WA tagihan baru ke tenant di awal setiap periode sewa.
 * Invoice yang period_start-nya hari ini atau sudah lewat (maks 3 hari lalu)
 * dan belum pernah dikirimkan notifikasinya (invoice_notified_at IS NULL)
 * akan dikirim sekarang.
 */
export async function runInvoiceNotificationCheck(): Promise<number> {
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
        // Kirim semua invoice yang periodenya sudah mulai (sudah atau hari ini)
        // Batas BAWAH dihapus agar invoice lama yang terlewat tetap terkirim.
        // Idempotency dijaga oleh invoice_notified_at IS NULL (tidak dobel kirim).
        sql`"period_start" <= CURRENT_DATE`,
      ),
    );

  logger.info({ count: invoices.length }, "[scheduler] Invoice baru perlu dikirim ke tenant");

  let sent = 0;

  for (const invoice of invoices) {
    const now = new Date();

    // Atomic claim: UPDATE hanya jika invoiceNotifiedAt masih NULL.
    // Jika proses lain sudah claim (multi-instance atau restart bersamaan),
    // RETURNING akan kosong dan kita skip — mencegah WA dobel.
    const claimed = await db
      .update(tenantInvoicesTable)
      .set({ invoiceNotifiedAt: now, updatedAt: now })
      .where(and(eq(tenantInvoicesTable.id, invoice.id), isNull(tenantInvoicesTable.invoiceNotifiedAt)))
      .returning({ id: tenantInvoicesTable.id });

    if (claimed.length === 0) {
      logger.info({ invoiceId: invoice.id }, "[scheduler] Invoice sudah di-claim proses lain, dilewati");
      continue;
    }

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

      if (result.ok && !result.skipped) {
        sent++;
        void notifyAdminGroup({
          eventType: "invoice_sent",
          businessName: invoice.businessName,
          ownerName: invoice.ownerName,
          invoiceNumber: invoice.invoiceNumber,
          amount: invoice.totalAmount,
          periodLabel: formatPeriodLabel(invoice.periodStart, invoice.periodEnd),
          dueDate: dueStr,
          siteName: companyName,
          paymentLink,
        }).catch(() => {});
      }
    }
  }

  logger.info({ sent, total: invoices.length }, "[scheduler] Pengiriman tagihan awal periode selesai");
  return sent;
}

// ─── H-3 dan H-1: Reminder sebelum jatuh tempo ───────────────────────────────

/**
 * Kirim WA pengingat 7 hari (H-7), 3 hari (H-3), dan 1 hari (H-1) sebelum jatuh tempo.
 * Menggunakan template sendInvoiceNotification — menyertakan link bayar.
 * Kolom dueReminder7dAt / dueReminder3dAt / dueReminder1dAt diset agar tidak kirim ulang.
 */
async function runDueReminderCheck(): Promise<{ h7: number; h3: number; h1: number }> {
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

      if (result.ok && !result.skipped) {
        sentH7++;
        void notifyAdminGroup({
          eventType: "reminder",
          businessName: invoice.businessName,
          ownerName: invoice.ownerName,
          invoiceNumber: invoice.invoiceNumber,
          amount: invoice.outstandingAmount ?? invoice.totalAmount,
          daysUntilDue: 7,
          dueDate: dueStr,
          paymentLink: await buildPaymentLink(invoice.paymentToken),
        }).catch(() => {});
      }
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

      if (result.ok && !result.skipped) {
        sentH3++;
        void notifyAdminGroup({
          eventType: "reminder",
          businessName: invoice.businessName,
          ownerName: invoice.ownerName,
          invoiceNumber: invoice.invoiceNumber,
          amount: invoice.outstandingAmount ?? invoice.totalAmount,
          daysUntilDue: 3,
          dueDate: dueStr,
          paymentLink: await buildPaymentLink(invoice.paymentToken),
        }).catch(() => {});
      }
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

      if (result.ok && !result.skipped) {
        sentH1++;
        void notifyAdminGroup({
          eventType: "reminder",
          businessName: invoice.businessName,
          ownerName: invoice.ownerName,
          invoiceNumber: invoice.invoiceNumber,
          amount: invoice.outstandingAmount ?? invoice.totalAmount,
          daysUntilDue: 1,
          dueDate: dueStr,
          paymentLink: await buildPaymentLink(invoice.paymentToken),
        }).catch(() => {});
      }
    }
  }

  logger.info(
    { sentH7, sentH3, sentH1 },
    "[scheduler] Pengingat WA H-7/H-3/H-1 selesai",
  );
  return { h7: sentH7, h3: sentH3, h1: sentH1 };
}

// ─── Overdue Reminder (sudah melewati jatuh tempo) ───────────────────────────

async function runOverdueCheck(): Promise<number> {
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
    return 0;
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

      if (result.ok && !result.skipped) {
        sent++;
        void notifyAdminGroup({
          eventType: "overdue",
          businessName: invoice.businessName,
          ownerName: invoice.ownerName,
          invoiceNumber: invoice.invoiceNumber,
          amount: invoice.outstandingAmount ?? invoice.totalAmount,
          daysOverdue,
          paymentLink: await buildPaymentLink(invoice.paymentToken),
        }).catch(() => {});
      }
    }
  }

  logger.info(
    { sent, total: overdueInvoices.length },
    "[scheduler] Pengingat WA overdue selesai",
  );
  return sent;
}
