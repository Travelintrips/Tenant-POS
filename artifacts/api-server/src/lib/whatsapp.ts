/**
 * WhatsApp Notification Service menggunakan Fonnte API
 * https://fonnte.com — gateway WA paling populer di Indonesia
 *
 * Set FONNTE_TOKEN di Replit Secrets untuk mengaktifkan.
 * Jika token tidak ada, notifikasi di-skip tanpa error.
 */

import { db } from "@workspace/db";
import { usersTable, systemSettingsTable } from "@workspace/db/schema";
import { sql, and, inArray, eq } from "drizzle-orm";
import { logger } from "./logger";

const FONNTE_TOKEN = process.env.FONNTE_API_KEY ?? process.env.FONNTE_TOKEN;
const FONNTE_SENDER = process.env.FONNTE_SENDER ?? "";
const FONNTE_URL = "https://api.fonnte.com/send";

// ─── Helper: ambil company_name dari mall_sites ───────────────────────────────

const _companyNameCache = new Map<number, { name: string; expiresAt: number }>();
const CACHE_TTL = 5 * 60 * 1000;

export async function getSiteCompanyName(siteId: number | null | undefined): Promise<string> {
  const DEFAULT = "Manajemen CST";
  if (!siteId || siteId <= 0) return DEFAULT;

  const cached = _companyNameCache.get(siteId);
  if (cached && cached.expiresAt > Date.now()) return cached.name;

  try {
    const result = await db.execute(sql`SELECT company_name FROM mall_sites WHERE id = ${siteId} LIMIT 1`);
    const rows = (result as { rows: Record<string, unknown>[] }).rows;
    const name = (rows[0]?.company_name as string | undefined) ?? DEFAULT;
    _companyNameCache.set(siteId, { name, expiresAt: Date.now() + CACHE_TTL });
    return name;
  } catch {
    return DEFAULT;
  }
}

/** Hapus cache company_name (dipanggil saat site diupdate) */
export function clearCompanyNameCache(siteId?: number) {
  if (siteId) {
    _companyNameCache.delete(siteId);
  } else {
    _companyNameCache.clear();
  }
}

/** Terjemahkan pesan error Fonnte ke Bahasa Indonesia yang lebih jelas */
function translateFonnteError(reason: string): string {
  const r = reason.toLowerCase();
  if (r.includes("disconnected")) return "Perangkat WhatsApp Fonnte tidak terhubung. Silakan scan ulang QR di dashboard Fonnte.";
  if (r.includes("invalid token") || r.includes("unauthorized")) return "Token Fonnte tidak valid. Periksa FONNTE_TOKEN di pengaturan.";
  if (r.includes("target")) return "Nomor HP tujuan tidak valid.";
  if (r.includes("message")) return "Pesan tidak boleh kosong.";
  if (r.includes("quota") || r.includes("limit")) return "Kuota pengiriman Fonnte habis.";
  return reason;
}

export interface WaResult {
  ok: boolean;
  skipped?: boolean;
  pending?: boolean;
  response?: unknown;
  error?: string;
}

/**
 * Format angka ke Rupiah, contoh: 5500000 → "Rp 5.500.000"
 */
export function formatRupiah(amount: number | string): string {
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  return "Rp " + n.toLocaleString("id-ID");
}

/**
 * Normalisasi nomor HP Indonesia ke format internasional tanpa +
 * 081234567890 → 6281234567890
 * 6281234567890 → 6281234567890
 * Group JID (misal: 12036341119221335@g.us) — tidak dinormalisasi
 */
function normalizePhone(phone: string): string {
  // Group JID dari WhatsApp — langsung pakai as-is
  if (phone.includes("@")) return phone;
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) return "62" + digits.slice(1);
  if (digits.startsWith("62")) return digits;
  return "62" + digits;
}

/**
 * Kirim pesan WA ke satu nomor atau Group JID.
 */
const DEV_PHONES = new Set(["6281111111111","6281111111112","6281111111113","6281111111114"]);

/**
 * Ambil daftar tujuan notifikasi WA admin.
 * Prioritas:
 *   1. ADMIN_WA_GROUP (group JID) — jika diset, kirim HANYA ke group, skip semua lainnya
 *   2. DB user owner/admin/finance aktif yang punya phone_number (filter dev placeholder)
 *      + selalu tambahkan ADMIN_WHATSAPP / FONNTE_ADMIN_WA jika ada
 *   3. Fallback ke system_settings.mall_config.adminPhone
 */
export async function getAdminNotifyPhones(): Promise<Array<{ name: string; phone: string }>> {
  const waGroup = process.env.ADMIN_WA_GROUP;
  if (waGroup) return [{ name: "Admin Group", phone: waGroup }];

  try {
    const rows = await db
      .select({ name: usersTable.name, phoneNumber: usersTable.phoneNumber })
      .from(usersTable)
      .where(
        and(
          inArray(usersTable.role, ["owner", "admin", "finance"]),
          eq(usersTable.status, "active"),
          sql`phone_number IS NOT NULL AND phone_number != ''`,
        ),
      );

    const phones: Array<{ name: string; phone: string }> = rows
      .filter((u) => u.phoneNumber && !DEV_PHONES.has(u.phoneNumber))
      .map((u) => ({ name: u.name, phone: u.phoneNumber! }));

    const envPhone = process.env.ADMIN_WHATSAPP ?? process.env.FONNTE_ADMIN_WA;
    if (envPhone && !phones.some((p) => p.phone === envPhone)) {
      phones.push({ name: "Admin", phone: envPhone });
    }

    if (phones.length === 0) {
      const [row] = await db
        .select({ value: systemSettingsTable.value })
        .from(systemSettingsTable)
        .where(eq(systemSettingsTable.key, "mall_config"));
      const phone = (row?.value as Record<string, unknown> | undefined)?.adminPhone;
      if (typeof phone === "string" && phone.length > 0) phones.push({ name: "Admin", phone });
    }

    return phones;
  } catch {
    const fallback = process.env.ADMIN_WHATSAPP ?? process.env.FONNTE_ADMIN_WA ?? process.env.ADMIN_WA_GROUP;
    return fallback ? [{ name: "Admin", phone: fallback }] : [];
  }
}

async function sendMessage(phone: string, message: string): Promise<WaResult> {
  if (!FONNTE_TOKEN) {
    return { ok: true, skipped: true };
  }

  try {
    // Group JID Fonnte format: XXXXXX@g.us — jangan dinormalisasi
    const target = phone.includes("@g.") ? phone : normalizePhone(phone);
    const params: Record<string, string> = { target, message, delay: "2" };
    if (FONNTE_SENDER) params.sender = FONNTE_SENDER;
    const body = new URLSearchParams(params);

    const res = await fetch(FONNTE_URL, {
      method: "POST",
      headers: {
        Authorization: FONNTE_TOKEN,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    const data = await res.json() as Record<string, unknown>;

    logger.info({ fonnte: data }, "[WA] Fonnte response");

    // Fonnte kadang return status sebagai string "false" atau boolean false
    const statusFailed = data["status"] === false || data["status"] === "false";
    // process: false → pesan diterima Fonnte tapi device offline/disconnected
    const processedFailed = data["process"] === false || data["process"] === "false";
    // process: "pending" → pesan masuk antrian Fonnte tapi belum terproses ke WA
    // ini sering terjadi ketika sesi WA di device Fonnte sudah expired
    const processPending = data["process"] === "pending";

    if (!res.ok || statusFailed || processedFailed) {
      const rawReason = String(data["reason"] ?? data["message"] ?? data["detail"] ?? "Gagal kirim WA");
      logger.error({ fonnte: data }, "[WA] Fonnte error: " + rawReason);
      return { ok: false, error: translateFonnteError(rawReason), response: data };
    }

    if (processPending) {
      logger.warn("[WA] Fonnte: pesan masuk antrian (pending) — kemungkinan sesi WA device expired. Periksa dashboard Fonnte dan reconnect device.");
      return { ok: true, pending: true, response: data };
    }

    return { ok: true, response: data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Template Pesan ──────────────────────────────────────────────────────────

export interface InvoiceNotifParams {
  ownerName: string;
  businessName: string;
  invoiceNumber: string;
  periodLabel: string;
  totalAmount: string | number;
  dueDate: string;
  phone: string;
  paymentLink?: string;
  companyName?: string;
}

export interface PaymentConfirmParams {
  ownerName: string;
  businessName: string;
  invoiceNumber: string;
  amountPaid: string | number;
  paymentMethod: string;
  phone: string;
  companyName?: string;
}

export interface OverdueReminderParams {
  ownerName: string;
  businessName: string;
  invoiceNumber: string;
  totalAmount: string | number;
  outstandingAmount: string | number;
  daysOverdue: number;
  phone: string;
  paymentLink?: string;
  companyName?: string;
}

/**
 * Kirim notifikasi invoice baru ke tenant
 */
export async function sendInvoiceNotification(params: InvoiceNotifParams): Promise<WaResult> {
  const company = params.companyName ?? "Manajemen CST";
  const linkLine = params.paymentLink
    ? `\n🔗 *Link Pembayaran:*\n${params.paymentLink}\n`
    : "";

  const message =
    `📋 *Tagihan Baru — ${params.businessName}*\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Yth. Bapak/Ibu *${params.ownerName}*,\n\n` +
    `Berikut adalah tagihan terbaru yang telah kami terbitkan untuk Anda:\n\n` +
    `• No. Invoice : *${params.invoiceNumber}*\n` +
    `• Periode       : ${params.periodLabel}\n` +
    `• Total Tagihan : *${formatRupiah(params.totalAmount)}*\n` +
    `• Jatuh Tempo  : *${params.dueDate}*\n` +
    linkLine +
    `\nMohon lakukan pembayaran sebelum tanggal jatuh tempo untuk menghindari denda keterlambatan.\n\n` +
    `Hubungi kami jika ada pertanyaan.\n\n` +
    `Terima kasih 🙏\n` +
    `_${company}_`;

  return sendMessage(params.phone, message);
}

export interface DueReminderParams {
  ownerName: string;
  businessName: string;
  invoiceNumber: string;
  periodLabel: string;
  totalAmount: string | number;
  outstandingAmount?: string | number | null;
  dueDate: string;
  daysUntilDue: number;
  phone: string;
  paymentLink?: string;
  companyName?: string;
}

/**
 * Kirim pengingat jatuh tempo (H-3 / H-1) — bukan tagihan baru.
 * Template ini berbeda dari sendInvoiceNotification agar tidak membingungkan tenant.
 */
export async function sendDueReminder(params: DueReminderParams): Promise<WaResult> {
  const company = params.companyName ?? "Manajemen CST";
  const dayLabel = params.daysUntilDue === 1 ? "1 hari lagi" : `${params.daysUntilDue} hari lagi`;
  const urgencyEmoji = params.daysUntilDue === 1 ? "🔴" : "🟡";
  const outstanding = params.outstandingAmount ?? params.totalAmount;
  const linkLine = params.paymentLink
    ? `\n🔗 *Link Pembayaran:*\n${params.paymentLink}\n`
    : "";

  const message =
    `${urgencyEmoji} *Pengingat Jatuh Tempo — ${params.businessName}*\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Yth. Bapak/Ibu *${params.ownerName}*,\n\n` +
    `Tagihan berikut akan jatuh tempo dalam *${dayLabel}*. Mohon segera lakukan pembayaran.\n\n` +
    `• No. Invoice       : *${params.invoiceNumber}*\n` +
    `• Periode            : ${params.periodLabel}\n` +
    `• Sisa Tagihan      : *${formatRupiah(outstanding)}*\n` +
    `• Jatuh Tempo       : *${params.dueDate}*\n` +
    linkLine +
    `\nPembayaran tepat waktu sangat membantu kelancaran operasional Anda.\n\n` +
    `Hubungi kami jika ada pertanyaan. Terima kasih 🙏\n` +
    `_${company}_`;

  return sendMessage(params.phone, message);
}

/**
 * Kirim konfirmasi pembayaran ke tenant
 */
export async function sendPaymentConfirmation(params: PaymentConfirmParams): Promise<WaResult> {
  const company = params.companyName ?? "Manajemen CST";
  const methodLabel: Record<string, string> = {
    transfer: "Transfer Bank",
    tunai: "Tunai / Cash",
    qris: "QRIS",
    edc: "EDC / Debit",
    other: "Lainnya",
  };

  const message =
    `✅ *Pembayaran Diterima — ${params.businessName}*\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Yth. Bapak/Ibu *${params.ownerName}*,\n\n` +
    `Pembayaran Anda telah kami terima dengan rincian sebagai berikut:\n\n` +
    `• No. Invoice : *${params.invoiceNumber}*\n` +
    `• Jumlah         : *${formatRupiah(params.amountPaid)}*\n` +
    `• Metode         : ${methodLabel[params.paymentMethod] ?? params.paymentMethod}\n\n` +
    `Terima kasih atas pembayaran Anda yang tepat waktu. 🙏\n` +
    `_${company}_`;

  return sendMessage(params.phone, message);
}

export interface PaymentReceivedParams {
  ownerName: string;
  businessName: string;
  invoiceNumber: string;
  amount: string | number;
  phone: string;
  companyName?: string;
}

export interface PaymentApprovedParams {
  ownerName: string;
  businessName: string;
  invoiceNumber: string;
  amount: string | number;
  phone: string;
  companyName?: string;
}

export interface PaymentRejectedParams {
  ownerName: string;
  businessName: string;
  invoiceNumber: string;
  rejectionReason: string;
  phone: string;
  companyName?: string;
}

/**
 * Kirim notifikasi bukti pembayaran diterima (menunggu verifikasi)
 */
export async function sendPaymentReceived(params: PaymentReceivedParams): Promise<WaResult> {
  const company = params.companyName ?? "Manajemen CST";
  const message =
    `🔔 *Bukti Pembayaran Diterima — ${params.businessName}*\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Yth. Bapak/Ibu *${params.ownerName}*,\n\n` +
    `Bukti pembayaran Anda telah kami terima dengan rincian:\n\n` +
    `• No. Invoice : *${params.invoiceNumber}*\n` +
    `• Jumlah         : *${formatRupiah(params.amount)}*\n\n` +
    `Pembayaran Anda sedang dalam proses verifikasi oleh tim kami. Anda akan mendapat konfirmasi setelah proses selesai.\n\n` +
    `Terima kasih atas kesabaran Anda. 🙏\n` +
    `_${company}_`;

  return sendMessage(params.phone, message);
}

/**
 * Kirim konfirmasi pembayaran disetujui admin
 */
export async function sendPaymentApproved(params: PaymentApprovedParams): Promise<WaResult> {
  const company = params.companyName ?? "Manajemen CST";
  const message =
    `✅ *Pembayaran Disetujui — ${params.businessName}*\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Yth. Bapak/Ibu *${params.ownerName}*,\n\n` +
    `Kami informasikan bahwa pembayaran Anda telah *diverifikasi dan disetujui* oleh tim kami.\n\n` +
    `• No. Invoice : *${params.invoiceNumber}*\n` +
    `• Jumlah         : *${formatRupiah(params.amount)}*\n\n` +
    `Simpan pesan ini sebagai bukti konfirmasi pembayaran Anda.\n\n` +
    `Terima kasih atas kepercayaan Anda. 🙏\n` +
    `_${company}_`;

  return sendMessage(params.phone, message);
}

/**
 * Kirim notifikasi pembayaran ditolak admin
 */
export async function sendPaymentRejected(params: PaymentRejectedParams): Promise<WaResult> {
  const company = params.companyName ?? "Manajemen CST";
  const message =
    `❌ *Pembayaran Tidak Dapat Diproses — ${params.businessName}*\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Yth. Bapak/Ibu *${params.ownerName}*,\n\n` +
    `Mohon maaf, bukti pembayaran Anda untuk invoice berikut tidak dapat kami proses:\n\n` +
    `• No. Invoice : *${params.invoiceNumber}*\n` +
    `• Alasan         : ${params.rejectionReason}\n\n` +
    `Mohon upload ulang bukti pembayaran yang valid melalui link yang telah dikirimkan sebelumnya, atau hubungi kami untuk informasi lebih lanjut.\n\n` +
    `Terima kasih. 🙏\n` +
    `_${company}_`;

  return sendMessage(params.phone, message);
}

export interface AdminPaymentAlertParams {
  ownerName: string;
  businessName: string;
  invoiceNumber: string;
  amount: string | number;
  paymentMethod: string;
  referenceNumber?: string | null;
  paymentId: number;
  adminPhone: string;
  reviewLink: string;
}

/**
 * Kirim notifikasi ke admin saat tenant submit bukti pembayaran.
 * Admin dapat membalas WA dengan:
 *   SETUJU {paymentId}       → approve
 *   TOLAK {paymentId} alasan → reject
 */
export async function sendAdminPaymentAlert(params: AdminPaymentAlertParams): Promise<WaResult> {
  const methodLabel: Record<string, string> = {
    transfer: "Transfer Bank",
    tunai: "Tunai / Cash",
    qris: "QRIS",
    edc: "EDC / Debit",
    other: "Lainnya",
  };

  const message =
    `🔔 *Bukti Pembayaran Baru Masuk*\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `• Tenant   : *${params.ownerName}* (${params.businessName})\n` +
    `• Invoice  : *${params.invoiceNumber}*\n` +
    `• Jumlah   : *${formatRupiah(params.amount)}*\n` +
    `• Metode   : ${methodLabel[params.paymentMethod] ?? params.paymentMethod}\n` +
    (params.referenceNumber ? `• Ref No   : ${params.referenceNumber}\n` : "") +
    `\n*Balas pesan ini untuk memproses:*\n` +
    `✅ SETUJU ${params.paymentId}\n` +
    `❌ TOLAK ${params.paymentId} <alasan>\n\n` +
    `🔗 ${params.reviewLink}`;

  return sendMessage(params.adminPhone, message);
}

export interface BankUnmatchedAlertParams {
  adminName: string;
  adminPhone: string;
  totalImported: number;
  unmatchedCount: number;
  autoMatchedCount: number;
  duplicateCount: number;
  bankAccountId?: string;
  source: "import_csv" | "import_sheet" | "scheduler";
}

/**
 * Kirim notifikasi ke admin/owner/finance saat ada mutasi bank yang unmatched
 * setelah proses import atau dari scheduler periodik.
 */
export async function sendBankUnmatchedAlert(params: BankUnmatchedAlertParams): Promise<WaResult> {
  const sourceLabel: Record<string, string> = {
    import_csv: "Upload CSV",
    import_sheet: "Google Sheets",
    scheduler: "Pengecekan Periodik",
  };

  const bankLine = params.bankAccountId
    ? `• Rekening       : *${params.bankAccountId}*\n`
    : "";

  let message: string;

  if (params.source === "scheduler") {
    message =
      `🔔 *Mutasi Bank Perlu Review*\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `Yth. *${params.adminName}*,\n\n` +
      `Terdapat *${params.unmatchedCount} mutasi bank* yang belum berhasil dicocokkan secara otomatis dan perlu ditinjau secara manual.\n\n` +
      bankLine +
      `• Belum Cocok   : *${params.unmatchedCount} mutasi*\n\n` +
      `Mohon segera buka menu *Rekonsiliasi Bank → Mutasi* untuk mencocokkan transaksi tersebut.\n\n` +
      `Terima kasih 🙏\n` +
      `_Sistem Manajemen Mall_`;
  } else {
    message =
      `🏦 *Hasil Import Mutasi Bank*\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `Yth. *${params.adminName}*,\n\n` +
      `Import mutasi bank via *${sourceLabel[params.source] ?? params.source}* telah selesai:\n\n` +
      bankLine +
      `• Total Diimport : *${params.totalImported} mutasi*\n` +
      `• Auto-cocok     : ✅ ${params.autoMatchedCount} mutasi\n` +
      `• Duplikat       : ⚠️ ${params.duplicateCount} mutasi\n` +
      `• Belum Cocok    : ❌ *${params.unmatchedCount} mutasi*\n\n` +
      (params.unmatchedCount > 0
        ? `*${params.unmatchedCount} mutasi perlu dicocokkan manual.* Buka menu *Rekonsiliasi Bank → Mutasi* untuk meninjau.\n\n`
        : `Semua mutasi berhasil dicocokkan otomatis. 🎉\n\n`) +
      `Terima kasih 🙏\n` +
      `_Sistem Manajemen Mall_`;
  }

  return sendMessage(params.adminPhone, message);
}

export interface ReconciliationReminderParams {
  ownerName: string;
  businessName: string;
  invoiceNumber: string;
  totalAmount: string | number;
  outstandingAmount: string | number;
  dueDate: string;
  phone: string;
  monthLabel: string;
  companyName?: string;
}

/**
 * Kirim pengingat rekonsiliasi ke tenant yang invoicenya belum terverifikasi bank
 */
export async function sendReconciliationReminder(params: ReconciliationReminderParams): Promise<WaResult> {
  const company = params.companyName ?? "Manajemen CST";
  const message =
    `📋 *Pengingat Rekonsiliasi — ${params.businessName}*\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Yth. Bapak/Ibu *${params.ownerName}*,\n\n` +
    `Kami belum menemukan konfirmasi pembayaran Anda untuk periode *${params.monthLabel}* dalam rekonsiliasi bank kami.\n\n` +
    `• No. Invoice       : *${params.invoiceNumber}*\n` +
    `• Total Tagihan     : ${formatRupiah(params.totalAmount)}\n` +
    `• Sisa Belum Bayar : *${formatRupiah(params.outstandingAmount)}*\n` +
    `• Jatuh Tempo       : ${params.dueDate}\n\n` +
    `Mohon segera:\n` +
    `1️⃣ Lakukan pembayaran jika belum dilakukan, atau\n` +
    `2️⃣ Kirimkan bukti transfer jika sudah membayar\n\n` +
    `Hubungi kami jika ada pertanyaan atau kendala pembayaran.\n\n` +
    `Terima kasih. 🙏\n` +
    `_${company}_`;

  return sendMessage(params.phone, message);
}

export interface BookingConfirmationParams {
  ownerName: string;
  businessName: string;
  orderNumber: string;
  contractNumber?: string | null;
  unitCode: string;
  floor?: string | null;
  startDate: string;
  endDate: string;
  durationMonths?: number | null;
  rentAmount: string | number;
  totalAmount?: string | number | null;
  dueDate?: string | null;
  phone: string;
  companyName?: string;
}

/**
 * Kirim konfirmasi booking/kontrak resmi ke tenant
 */
export async function sendBookingConfirmation(params: BookingConfirmationParams): Promise<WaResult> {
  const company = params.companyName ?? "Manajemen CST";
  const fmtDate = (d: string) => {
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? d : dt.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
  };

  const contractLine = params.contractNumber
    ? `• No. Kontrak    : *${params.contractNumber}*\n`
    : `• No. Order      : *${params.orderNumber}*\n`;

  const floorLine = params.floor ? ` · ${params.floor}` : "";
  const durationLine = params.durationMonths
    ? `• Durasi Sewa    : *${params.durationMonths} bulan*\n`
    : "";

  const totalLine = params.totalAmount
    ? `• Total Tagihan  : ${formatRupiah(params.totalAmount)}\n`
    : "";

  const dueLine = params.dueDate
    ? `• Tagihan Pertama: *${fmtDate(params.dueDate)}*\n`
    : "";

  const message =
    `🎉 *Kontrak Sewa Resmi Dibuat*\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Yth. Bapak/Ibu *${params.ownerName}*,\n\n` +
    `Selamat! Kontrak sewa untuk usaha Anda telah resmi dibuat dengan rincian sebagai berikut:\n\n` +
    contractLine +
    `• Nama Usaha     : *${params.businessName}*\n` +
    `• Unit / Lokasi  : *${params.unitCode}*${floorLine}\n` +
    `• Periode Sewa   : ${fmtDate(params.startDate)} s/d ${fmtDate(params.endDate)}\n` +
    durationLine +
    `• Harga Sewa     : *${formatRupiah(params.rentAmount)}/bulan*\n` +
    totalLine +
    dueLine +
    `\nMohon simpan pesan ini sebagai bukti konfirmasi kontrak Anda.\n\n` +
    `Jika ada pertanyaan terkait kontrak, silakan hubungi tim manajemen kami.\n\n` +
    `Terima kasih atas kepercayaan Anda. 🙏\n` +
    `_${company}_`;

  return sendMessage(params.phone, message);
}

export interface ContractActivatedParams {
  ownerName: string;
  businessName: string;
  contractNumber?: string | null;
  orderNumber: string;
  unitCode: string;
  floor?: string | null;
  startDate: string;
  endDate: string;
  phone: string;
  companyName?: string;
}

/**
 * Kirim notifikasi kontrak resmi aktif ke tenant
 */
export async function sendContractActivated(params: ContractActivatedParams): Promise<WaResult> {
  const company = params.companyName ?? "Manajemen CST";
  const fmtDate = (d: string) => {
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? d : dt.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
  };
  const refLine = params.contractNumber
    ? `• No. Kontrak  : *${params.contractNumber}*\n`
    : `• No. Order    : *${params.orderNumber}*\n`;
  const floorLine = params.floor ? ` · ${params.floor}` : "";
  const message =
    `✅ *Kontrak Sewa Resmi Aktif*\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Yth. Bapak/Ibu *${params.ownerName}*,\n\n` +
    `Kontrak sewa Anda kini telah berstatus *AKTIF*:\n\n` +
    refLine +
    `• Nama Usaha   : *${params.businessName}*\n` +
    `• Unit         : *${params.unitCode}*${floorLine}\n` +
    `• Periode      : ${fmtDate(params.startDate)} s/d ${fmtDate(params.endDate)}\n\n` +
    `Selamat beroperasi! Jika ada pertanyaan, silakan hubungi tim manajemen kami.\n\n` +
    `Terima kasih. 🙏\n` +
    `_${company}_`;
  return sendMessage(params.phone, message);
}

export interface ContractExpiringSoonParams {
  ownerName: string;
  businessName: string;
  contractNumber?: string | null;
  orderNumber: string;
  unitCode: string;
  endDate: string;
  daysLeft: number;
  phone: string;
  companyName?: string;
}

/**
 * Kirim pengingat kontrak akan berakhir dalam 30 hari
 */
export async function sendContractExpiringSoon(params: ContractExpiringSoonParams): Promise<WaResult> {
  const company = params.companyName ?? "Manajemen CST";
  const fmtDate = (d: string) => {
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? d : dt.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
  };
  const refLine = params.contractNumber
    ? `• No. Kontrak  : *${params.contractNumber}*\n`
    : `• No. Order    : *${params.orderNumber}*\n`;
  const message =
    `⚠️ *Kontrak Sewa Akan Segera Berakhir*\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Yth. Bapak/Ibu *${params.ownerName}*,\n\n` +
    `Kami menginformasikan bahwa kontrak sewa Anda akan berakhir dalam *${params.daysLeft} hari* lagi.\n\n` +
    refLine +
    `• Nama Usaha   : *${params.businessName}*\n` +
    `• Unit         : *${params.unitCode}*\n` +
    `• Berakhir     : *${fmtDate(params.endDate)}*\n\n` +
    `Mohon segera hubungi tim manajemen kami jika Anda ingin memperpanjang kontrak sewa.\n\n` +
    `Terima kasih. 🙏\n` +
    `_${company}_`;
  return sendMessage(params.phone, message);
}

export interface ContractTerminatedParams {
  ownerName: string;
  businessName: string;
  contractNumber?: string | null;
  orderNumber: string;
  unitCode: string;
  reason?: string | null;
  phone: string;
  companyName?: string;
}

/**
 * Kirim notifikasi kontrak diterminasi ke tenant
 */
export async function sendContractTerminated(params: ContractTerminatedParams): Promise<WaResult> {
  const company = params.companyName ?? "Manajemen CST";
  const refLine = params.contractNumber
    ? `• No. Kontrak  : *${params.contractNumber}*\n`
    : `• No. Order    : *${params.orderNumber}*\n`;
  const reasonLine = params.reason
    ? `• Alasan       : ${params.reason}\n`
    : "";
  const message =
    `🔴 *Kontrak Sewa Diakhiri*\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Yth. Bapak/Ibu *${params.ownerName}*,\n\n` +
    `Kami menginformasikan bahwa kontrak sewa Anda telah resmi *diakhiri (terminasi)*:\n\n` +
    refLine +
    `• Nama Usaha   : *${params.businessName}*\n` +
    `• Unit         : *${params.unitCode}*\n` +
    reasonLine +
    `\nUntuk informasi lebih lanjut terkait proses pengakhiran kontrak, silakan hubungi tim manajemen kami.\n\n` +
    `Terima kasih atas kepercayaan Anda selama ini. 🙏\n` +
    `_${company}_`;
  return sendMessage(params.phone, message);
}

/**
 * Kirim reminder ke calon tenant yang pendaftarannya masih pending (bulk reminder)
 */
export async function sendCalonTenantReminder(phone: string, brandOrName?: string, companyName?: string): Promise<WaResult> {
  const company = companyName ?? "Manajemen CST";
  const nameLine = brandOrName ? `Halo *${brandOrName}*,` : "Halo,";
  const message =
    `🔔 *Pengingat Pendaftaran Tenant*\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `${nameLine}\n\n` +
    `Pendaftaran tenant Anda saat ini masih *menunggu proses* dari tim kami.\n\n` +
    `Mohon pastikan dokumen/perjanjian Anda telah dilengkapi. Jika membutuhkan bantuan atau ada pertanyaan, tim kami siap membantu.\n\n` +
    `Terima kasih atas kesabaran Anda. 🙏\n` +
    `_${company}_`;
  return sendMessage(phone, message);
}

/**
 * Kirim notifikasi ke calon tenant saat pendaftaran disetujui admin
 */
export async function sendCalonTenantApproved(phone: string, brandName?: string, companyName?: string): Promise<WaResult> {
  const company = companyName ?? "Manajemen CST";
  const nameLine = brandName ? ` atas nama *${brandName}*` : "";
  const message =
    `✅ *Pendaftaran Tenant Disetujui*\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Selamat! Pendaftaran tenant Anda${nameLine} telah *disetujui* oleh tim kami.\n\n` +
    `Tim kami akan segera menghubungi Anda untuk proses berikutnya.\n\n` +
    `Terima kasih atas kepercayaan Anda. 🙏\n` +
    `_${company}_`;
  return sendMessage(phone, message);
}

/**
 * Kirim notifikasi ke calon tenant saat pendaftaran ditolak admin
 */
export async function sendCalonTenantRejected(phone: string, brandName?: string, companyName?: string): Promise<WaResult> {
  const company = companyName ?? "Manajemen CST";
  const nameLine = brandName ? ` atas nama *${brandName}*` : "";
  const message =
    `❌ *Pendaftaran Tenant Tidak Dapat Diproses*\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Mohon maaf, pendaftaran tenant Anda${nameLine} belum dapat kami lanjutkan saat ini.\n\n` +
    `Untuk informasi lebih lanjut, silakan hubungi tim manajemen kami.\n\n` +
    `Terima kasih. 🙏\n` +
    `_${company}_`;
  return sendMessage(phone, message);
}

/**
 * Kirim notifikasi ke calon tenant bahwa ada unit yang kini kosong / tersedia
 */
export async function sendCalonTenantUnitAvailable(
  phone: string,
  picName: string | undefined,
  unitCodes: string[],
  companyName?: string,
): Promise<WaResult> {
  const company = companyName ?? "Manajemen CST";
  const salam = picName ? `Halo *${picName}*,` : "Halo,";
  const unitList = unitCodes.map((u) => `  • *${u}*`).join("\n");
  const unitSection =
    unitCodes.length === 1
      ? `Unit yang kini tersedia:\n  • *${unitCodes[0]}*`
      : `Unit-unit yang kini tersedia:\n${unitList}`;
  const message =
    `🏪 *Kabar Baik — Unit Tersedia!*\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `${salam}\n\n` +
    `Kami ingin memberitahukan bahwa saat ini ada unit yang *kosong dan siap disewa* di mall kami.\n\n` +
    `${unitSection}\n\n` +
    `Jika Anda masih tertarik, segera hubungi tim manajemen kami untuk informasi lebih lanjut dan proses sewa.\n\n` +
    `Jangan lewatkan kesempatan ini! 🙏\n` +
    `_${company}_`;
  return sendMessage(phone, message);
}

export interface PosPaymentSuccessParams {
  ownerName: string;
  businessName: string;
  invoiceNumber?: string | null;
  amountPaid: string | number;
  paymentMethod: string;
  receiptNumber: string;
  receiptUrl?: string | null;
  phone: string;
  companyName?: string;
}

/**
 * Kirim notifikasi pembayaran POS berhasil ke tenant — termasuk link receipt
 */
export async function sendPosPaymentSuccess(params: PosPaymentSuccessParams): Promise<WaResult> {
  const company = params.companyName ?? "Manajemen CST";
  const methodLabel: Record<string, string> = {
    transfer: "Transfer Bank",
    tunai: "Tunai / Cash",
    qris: "QRIS",
    edc: "EDC / Debit",
    other: "Lainnya",
  };

  const invoiceLine = params.invoiceNumber
    ? `• No. Invoice  : *${params.invoiceNumber}*\n`
    : "";

  const receiptLine = params.receiptUrl
    ? `\n🧾 *Receipt / Kuitansi:*\n${params.receiptUrl}\n`
    : "";

  const message =
    `✅ *Pembayaran Diterima — ${params.businessName}*\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Yth. Bapak/Ibu *${params.ownerName}*,\n\n` +
    `Pembayaran Anda telah kami terima dengan rincian:\n\n` +
    invoiceLine +
    `• No. Kuitansi : *${params.receiptNumber}*\n` +
    `• Jumlah         : *${formatRupiah(params.amountPaid)}*\n` +
    `• Metode         : ${methodLabel[params.paymentMethod] ?? params.paymentMethod}\n` +
    receiptLine +
    `\nTerima kasih atas pembayaran Anda yang tepat waktu. 🙏\n` +
    `_${company}_`;

  return sendMessage(params.phone, message);
}

export interface AdminPosPaymentAlertParams {
  adminName: string;
  adminPhone: string;
  businessName: string;
  ownerName: string;
  receiptNumber: string;
  invoiceNumber?: string | null;
  amountPaid: string | number;
  paymentMethod: string;
  kasirName: string;
  siteName?: string | null;
}

/**
 * Kirim notifikasi ke admin/owner saat kasir mencatat pembayaran POS baru.
 */
export async function sendAdminPosPaymentAlert(params: AdminPosPaymentAlertParams): Promise<WaResult> {
  const methodLabel: Record<string, string> = {
    transfer: "Transfer Bank",
    tunai: "Tunai / Cash",
    qris: "QRIS",
    edc: "EDC / Debit",
    other: "Lainnya",
  };
  const invoiceLine = params.invoiceNumber ? `• No. Invoice  : *${params.invoiceNumber}*\n` : "";
  const siteLine = params.siteName ? `• Lokasi       : ${params.siteName}\n` : "";
  const message =
    `🏪 *Pembayaran POS Baru Diterima*\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Yth. *${params.adminName}*,\n\n` +
    `Ada pembayaran baru yang dicatat oleh kasir:\n\n` +
    `• Tenant       : *${params.businessName}* (${params.ownerName})\n` +
    invoiceLine +
    `• No. Kuitansi : *${params.receiptNumber}*\n` +
    `• Jumlah       : *${formatRupiah(params.amountPaid)}*\n` +
    `• Metode       : ${methodLabel[params.paymentMethod] ?? params.paymentMethod}\n` +
    `• Kasir        : ${params.kasirName}\n` +
    siteLine +
    `\n_Sistem Manajemen Mall_`;
  return sendMessage(params.adminPhone, message);
}

export async function sendOverdueReminder(params: OverdueReminderParams): Promise<WaResult> {
  const company = params.companyName ?? "Manajemen CST";
  const linkLine = params.paymentLink
    ? `\n🔗 *Link Pembayaran:*\n${params.paymentLink}\n`
    : "";

  const message =
    `🔴 *Tagihan Melewati Jatuh Tempo — ${params.businessName}*\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Yth. Bapak/Ibu *${params.ownerName}*,\n\n` +
    `Kami menginformasikan bahwa tagihan Anda telah melewati batas waktu pembayaran.\n\n` +
    `• No. Invoice       : *${params.invoiceNumber}*\n` +
    `• Total Tagihan     : ${formatRupiah(params.totalAmount)}\n` +
    `• Sisa Belum Bayar : *${formatRupiah(params.outstandingAmount)}*\n` +
    `• Keterlambatan     : *${params.daysOverdue} hari*\n` +
    linkLine +
    `\nMohon segera lakukan pembayaran untuk menghindari sanksi keterlambatan lebih lanjut.\n\n` +
    `Hubungi kami jika ada pertanyaan atau kendala.\n\n` +
    `Terima kasih. 🙏\n` +
    `_${company}_`;

  return sendMessage(params.phone, message);
}

// ─── Admin Group Notification ─────────────────────────────────────────────────

export interface AdminGroupPaymentParams {
  eventType: "bukti_pembayaran" | "pos_kasir" | "payment_approved" | "payment_rejected";
  businessName: string;
  ownerName: string;
  invoiceNumber?: string | null;
  receiptNumber?: string | null;
  amount: string | number;
  paymentMethod?: string;
  kasirName?: string | null;
  siteName?: string | null;
  referenceNumber?: string | null;
  reviewLink?: string | null;
  rejectionReason?: string | null;
}

/**
 * Kirim notifikasi ringkas ke WhatsApp Group admin (ADMIN_WA_GROUP).
 * Dipanggil secara fire-and-forget bersamaan dengan notifikasi individual.
 * Group JID format: 12036341119221335@g.us (tidak perlu normalisasi nomor)
 */
export async function notifyAdminGroup(params: AdminGroupPaymentParams): Promise<WaResult> {
  const groupJid = process.env.ADMIN_WA_GROUP;
  if (!groupJid) return { ok: true, skipped: true };

  const methodLabel: Record<string, string> = {
    transfer: "Transfer Bank",
    tunai: "Tunai / Cash",
    qris: "QRIS",
    edc: "EDC / Debit",
    other: "Lainnya",
  };

  const now = new Date().toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  let emoji = "🔔";
  let title = "Notifikasi Pembayaran";

  if (params.eventType === "bukti_pembayaran") {
    emoji = "📤";
    title = "Bukti Pembayaran Masuk";
  } else if (params.eventType === "pos_kasir") {
    emoji = "🏪";
    title = "Pembayaran POS Kasir";
  } else if (params.eventType === "payment_approved") {
    emoji = "✅";
    title = "Pembayaran Disetujui";
  } else if (params.eventType === "payment_rejected") {
    emoji = "❌";
    title = "Pembayaran Ditolak";
  }

  const invoiceLine = params.invoiceNumber ? `• Invoice    : *${params.invoiceNumber}*\n` : "";
  const receiptLine = params.receiptNumber ? `• Kuitansi  : *${params.receiptNumber}*\n` : "";
  const methodLine = params.paymentMethod
    ? `• Metode    : ${methodLabel[params.paymentMethod] ?? params.paymentMethod}\n`
    : "";
  const kasirLine = params.kasirName ? `• Kasir     : ${params.kasirName}\n` : "";
  const siteLine = params.siteName ? `• Lokasi    : ${params.siteName}\n` : "";
  const refLine = params.referenceNumber ? `• Ref No    : ${params.referenceNumber}\n` : "";
  const reviewLine = params.reviewLink ? `\n🔗 ${params.reviewLink}` : "";
  const rejectLine = params.rejectionReason ? `• Alasan    : ${params.rejectionReason}\n` : "";

  const message =
    `${emoji} *${title}*\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `• Tenant    : *${params.businessName}* (${params.ownerName})\n` +
    invoiceLine +
    receiptLine +
    `• Jumlah    : *${formatRupiah(params.amount)}*\n` +
    methodLine +
    kasirLine +
    refLine +
    siteLine +
    rejectLine +
    `• Waktu     : ${now}\n` +
    reviewLine;

  return sendMessage(groupJid, message);
}

// ─── Invoice Konsolidasi ──────────────────────────────────────────────────────

export interface ConsolidatedInvoiceWaParams {
  phone: string;
  ownerName: string;
  businessName: string;
  invoiceNumber: string;
  periodLabel: string | null;
  dueDate: string | null;
  totalAmount: string | number;
  outstandingAmount: string | number;
  paidAmount: string | number;
  items: Array<{
    unitCode: string | null;
    invoiceNumber: string;
    amount: string | number;
    invoiceOutstanding: string | number;
  }>;
  companyName?: string;
}

export async function sendConsolidatedInvoiceNotification(
  params: ConsolidatedInvoiceWaParams
): Promise<WaResult> {
  const company = params.companyName ?? "Manajemen CST";

  const itemLines = params.items
    .map((item, i) => {
      const unit = item.unitCode ? `Unit ${item.unitCode}` : `Item ${i + 1}`;
      return `  ${i + 1}. *${unit}* — ${item.invoiceNumber}\n     Tagihan: ${formatRupiah(item.amount)} | Sisa: *${formatRupiah(item.invoiceOutstanding)}*`;
    })
    .join("\n");

  const dueLine = params.dueDate
    ? `• Jatuh Tempo     : *${new Date(params.dueDate).toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })}*\n`
    : "";

  const periodLine = params.periodLabel
    ? `• Periode            : ${params.periodLabel}\n`
    : "";

  const alreadyPaid = Number(params.paidAmount) > 0
    ? `• Sudah Dibayar  : ${formatRupiah(params.paidAmount)}\n`
    : "";

  const message =
    `📦 *Tagihan Konsolidasi — ${params.businessName}*\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Yth. Bapak/Ibu *${params.ownerName}*,\n\n` +
    `Berikut tagihan konsolidasi untuk semua unit yang Anda sewa:\n\n` +
    `• No. Invoice       : *${params.invoiceNumber}*\n` +
    periodLine +
    dueLine +
    `\n📋 *Rincian per Unit:*\n` +
    itemLines +
    `\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    alreadyPaid +
    `• *Total Sisa Tagihan : ${formatRupiah(params.outstandingAmount)}*\n\n` +
    `Mohon lakukan pembayaran sebelum tanggal jatuh tempo.\n` +
    `Hubungi kami jika ada pertanyaan.\n\n` +
    `Terima kasih 🙏\n` +
    `_${company}_`;

  return sendMessage(params.phone, message);
}
