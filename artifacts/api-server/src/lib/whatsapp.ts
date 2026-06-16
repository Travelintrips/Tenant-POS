/**
 * WhatsApp Notification Service menggunakan Fonnte API
 * https://fonnte.com — gateway WA paling populer di Indonesia
 *
 * Set FONNTE_TOKEN di Replit Secrets untuk mengaktifkan.
 * Jika token tidak ada, notifikasi di-skip tanpa error.
 */

const FONNTE_TOKEN = process.env.FONNTE_TOKEN;
const FONNTE_SENDER = process.env.FONNTE_SENDER ?? "";
const FONNTE_URL = "https://api.fonnte.com/send";

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
 */
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) return "62" + digits.slice(1);
  if (digits.startsWith("62")) return digits;
  return "62" + digits;
}

/**
 * Kirim pesan WA ke satu nomor.
 */
async function sendMessage(phone: string, message: string): Promise<WaResult> {
  if (!FONNTE_TOKEN) {
    return { ok: true, skipped: true };
  }

  try {
    const target = normalizePhone(phone);
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

    if (!res.ok || data["status"] === false) {
      const rawReason = String(data["reason"] ?? data["message"] ?? "Gagal kirim WA");
      return { ok: false, error: translateFonnteError(rawReason), response: data };
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
}

export interface PaymentConfirmParams {
  ownerName: string;
  businessName: string;
  invoiceNumber: string;
  amountPaid: string | number;
  paymentMethod: string;
  phone: string;
}

export interface OverdueReminderParams {
  ownerName: string;
  businessName: string;
  invoiceNumber: string;
  totalAmount: string | number;
  outstandingAmount: string | number;
  daysOverdue: number;
  phone: string;
}

/**
 * Kirim notifikasi invoice baru ke tenant
 */
export async function sendInvoiceNotification(params: InvoiceNotifParams): Promise<WaResult> {
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
    `_Manajemen CST_`;

  return sendMessage(params.phone, message);
}

/**
 * Kirim konfirmasi pembayaran ke tenant
 */
export async function sendPaymentConfirmation(params: PaymentConfirmParams): Promise<WaResult> {
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
    `_Manajemen CST_`;

  return sendMessage(params.phone, message);
}

export interface PaymentReceivedParams {
  ownerName: string;
  businessName: string;
  invoiceNumber: string;
  amount: string | number;
  phone: string;
}

export interface PaymentApprovedParams {
  ownerName: string;
  businessName: string;
  invoiceNumber: string;
  amount: string | number;
  phone: string;
}

export interface PaymentRejectedParams {
  ownerName: string;
  businessName: string;
  invoiceNumber: string;
  rejectionReason: string;
  phone: string;
}

/**
 * Kirim notifikasi bukti pembayaran diterima (menunggu verifikasi)
 */
export async function sendPaymentReceived(params: PaymentReceivedParams): Promise<WaResult> {
  const message =
    `🔔 *Bukti Pembayaran Diterima — ${params.businessName}*\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Yth. Bapak/Ibu *${params.ownerName}*,\n\n` +
    `Bukti pembayaran Anda telah kami terima dengan rincian:\n\n` +
    `• No. Invoice : *${params.invoiceNumber}*\n` +
    `• Jumlah         : *${formatRupiah(params.amount)}*\n\n` +
    `Pembayaran Anda sedang dalam proses verifikasi oleh tim kami. Anda akan mendapat konfirmasi setelah proses selesai.\n\n` +
    `Terima kasih atas kesabaran Anda. 🙏\n` +
    `_Manajemen CST_`;

  return sendMessage(params.phone, message);
}

/**
 * Kirim konfirmasi pembayaran disetujui admin
 */
export async function sendPaymentApproved(params: PaymentApprovedParams): Promise<WaResult> {
  const message =
    `✅ *Pembayaran Disetujui — ${params.businessName}*\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Yth. Bapak/Ibu *${params.ownerName}*,\n\n` +
    `Kami informasikan bahwa pembayaran Anda telah *diverifikasi dan disetujui* oleh tim kami.\n\n` +
    `• No. Invoice : *${params.invoiceNumber}*\n` +
    `• Jumlah         : *${formatRupiah(params.amount)}*\n\n` +
    `Simpan pesan ini sebagai bukti konfirmasi pembayaran Anda.\n\n` +
    `Terima kasih atas kepercayaan Anda. 🙏\n` +
    `_Manajemen CST_`;

  return sendMessage(params.phone, message);
}

/**
 * Kirim notifikasi pembayaran ditolak admin
 */
export async function sendPaymentRejected(params: PaymentRejectedParams): Promise<WaResult> {
  const message =
    `❌ *Pembayaran Tidak Dapat Diproses — ${params.businessName}*\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Yth. Bapak/Ibu *${params.ownerName}*,\n\n` +
    `Mohon maaf, bukti pembayaran Anda untuk invoice berikut tidak dapat kami proses:\n\n` +
    `• No. Invoice : *${params.invoiceNumber}*\n` +
    `• Alasan         : ${params.rejectionReason}\n\n` +
    `Mohon upload ulang bukti pembayaran yang valid melalui link yang telah dikirimkan sebelumnya, atau hubungi kami untuk informasi lebih lanjut.\n\n` +
    `Terima kasih. 🙏\n` +
    `_Manajemen CST_`;

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
}

/**
 * Kirim pengingat rekonsiliasi ke tenant yang invoicenya belum terverifikasi bank
 */
export async function sendReconciliationReminder(params: ReconciliationReminderParams): Promise<WaResult> {
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
    `_Manajemen CST_`;

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
}

/**
 * Kirim konfirmasi booking/kontrak resmi ke tenant
 */
export async function sendBookingConfirmation(params: BookingConfirmationParams): Promise<WaResult> {
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
    `_Manajemen CST_`;

  return sendMessage(params.phone, message);
}

/**
 * Kirim pengingat tagihan overdue ke tenant
 */
export async function sendOverdueReminder(params: OverdueReminderParams): Promise<WaResult> {
  const message =
    `⚠️ *Tagihan Melewati Jatuh Tempo — ${params.businessName}*\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Yth. Bapak/Ibu *${params.ownerName}*,\n\n` +
    `Kami menginformasikan bahwa tagihan Anda telah melewati batas waktu pembayaran.\n\n` +
    `• No. Invoice       : *${params.invoiceNumber}*\n` +
    `• Total Tagihan     : ${formatRupiah(params.totalAmount)}\n` +
    `• Sisa Belum Bayar : *${formatRupiah(params.outstandingAmount)}*\n` +
    `• Keterlambatan     : *${params.daysOverdue} hari*\n\n` +
    `Mohon segera lakukan pembayaran untuk menghindari sanksi keterlambatan lebih lanjut.\n\n` +
    `Hubungi kami jika ada pertanyaan atau kendala.\n\n` +
    `Terima kasih. 🙏\n` +
    `_Manajemen CST_`;

  return sendMessage(params.phone, message);
}
