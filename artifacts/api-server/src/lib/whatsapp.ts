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
    ? `\n🔗 *Link Upload Bukti Bayar:*\n${params.paymentLink}\n`
    : "";

  const message =
    `Halo *${params.ownerName}* (${params.businessName}) 👋\n\n` +
    `📋 *Invoice Baru Telah Diterbitkan*\n\n` +
    `No. Invoice : *${params.invoiceNumber}*\n` +
    `Periode     : ${params.periodLabel}\n` +
    `Total       : *${formatRupiah(params.totalAmount)}*\n` +
    `Jatuh Tempo : ${params.dueDate}\n` +
    linkLine +
    `\nMohon segera lakukan pembayaran sebelum tanggal jatuh tempo.\n\n` +
    `Terima kasih 🙏\n` +
    `_Manajemen Mall_`;

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
    `Halo *${params.ownerName}* (${params.businessName}) 👋\n\n` +
    `✅ *Pembayaran Berhasil Dikonfirmasi*\n\n` +
    `No. Invoice : *${params.invoiceNumber}*\n` +
    `Jumlah      : *${formatRupiah(params.amountPaid)}*\n` +
    `Metode      : ${methodLabel[params.paymentMethod] ?? params.paymentMethod}\n\n` +
    `Pembayaran Anda telah kami terima. Terima kasih! 🙏\n\n` +
    `_Manajemen Mall_`;

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
    `Halo *${params.ownerName}* (${params.businessName}) 👋\n\n` +
    `🔔 *Bukti Pembayaran Diterima*\n\n` +
    `No. Invoice : *${params.invoiceNumber}*\n` +
    `Jumlah      : *${formatRupiah(params.amount)}*\n\n` +
    `Bukti pembayaran Anda telah kami terima dan sedang dalam proses verifikasi oleh admin.\n` +
    `Anda akan mendapat konfirmasi setelah diverifikasi.\n\n` +
    `Terima kasih 🙏\n` +
    `_Manajemen Mall_`;

  return sendMessage(params.phone, message);
}

/**
 * Kirim konfirmasi pembayaran disetujui admin
 */
export async function sendPaymentApproved(params: PaymentApprovedParams): Promise<WaResult> {
  const message =
    `Halo *${params.ownerName}* (${params.businessName}) 👋\n\n` +
    `✅ *Pembayaran Disetujui*\n\n` +
    `No. Invoice : *${params.invoiceNumber}*\n` +
    `Jumlah      : *${formatRupiah(params.amount)}*\n\n` +
    `Pembayaran Anda telah diverifikasi dan disetujui. Terima kasih! 🙏\n\n` +
    `_Manajemen Mall_`;

  return sendMessage(params.phone, message);
}

/**
 * Kirim notifikasi pembayaran ditolak admin
 */
export async function sendPaymentRejected(params: PaymentRejectedParams): Promise<WaResult> {
  const message =
    `Halo *${params.ownerName}* (${params.businessName}) 👋\n\n` +
    `❌ *Pembayaran Ditolak*\n\n` +
    `No. Invoice : *${params.invoiceNumber}*\n` +
    `Alasan      : ${params.rejectionReason}\n\n` +
    `Mohon upload ulang bukti pembayaran yang valid atau hubungi kami untuk informasi lebih lanjut.\n\n` +
    `Terima kasih 🙏\n` +
    `_Manajemen Mall_`;

  return sendMessage(params.phone, message);
}

/**
 * Kirim pengingat tagihan overdue ke tenant
 */
export async function sendOverdueReminder(params: OverdueReminderParams): Promise<WaResult> {
  const message =
    `Halo *${params.ownerName}* (${params.businessName}) 👋\n\n` +
    `⚠️ *Pengingat Tagihan Jatuh Tempo*\n\n` +
    `No. Invoice : *${params.invoiceNumber}*\n` +
    `Total Tagihan    : ${formatRupiah(params.totalAmount)}\n` +
    `Sisa Belum Bayar : *${formatRupiah(params.outstandingAmount)}*\n` +
    `Terlambat        : *${params.daysOverdue} hari*\n\n` +
    `Mohon segera lakukan pembayaran untuk menghindari sanksi keterlambatan lebih lanjut.\n\n` +
    `Hubungi kami jika ada pertanyaan.\n` +
    `Terima kasih 🙏\n\n` +
    `_Manajemen Mall_`;

  return sendMessage(params.phone, message);
}
