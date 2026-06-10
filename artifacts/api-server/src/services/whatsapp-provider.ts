import { logger } from "../lib/logger";

export interface SendOtpResult {
  sent: boolean;
  error?: string;
}

async function sendViaFonnte(phoneNumber: string, otp: string): Promise<SendOtpResult> {
  const apiKey = process.env.FONNTE_API_KEY;
  const sender = process.env.FONNTE_SENDER ?? "";

  if (!apiKey) {
    return { sent: false, error: "FONNTE_API_KEY tidak dikonfigurasi" };
  }

  const message = `Kode OTP Portal Admin Mall Anda: *${otp}*\n\nBerlaku ${process.env.OTP_EXPIRY_MINUTES ?? "5"} menit. Jangan bagikan kode ini kepada siapapun.`;

  const body = new URLSearchParams({
    target: phoneNumber,
    message,
    ...(sender ? { sender } : {}),
  });

  const res = await fetch("https://api.fonnte.com/send", {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { sent: false, error: `Fonnte error ${res.status}: ${text}` };
  }

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (data.status === false) {
    return { sent: false, error: `Fonnte gagal: ${JSON.stringify(data.reason ?? data)}` };
  }

  return { sent: true };
}

export async function sendOtpWhatsapp(
  phoneNumber: string,
  otp: string,
): Promise<SendOtpResult> {
  const isProduction = process.env.NODE_ENV === "production";

  if (!isProduction) {
    logger.info({ phoneNumber }, "[whatsapp-provider] Dev mode — OTP tidak dikirim via WA");
    return { sent: true };
  }

  if (!otp) {
    logger.error("[whatsapp-provider] OTP kosong — tidak dikirim");
    return { sent: false, error: "OTP tidak boleh kosong" };
  }

  if (process.env.FONNTE_API_KEY) {
    return sendViaFonnte(phoneNumber, otp);
  }

  logger.error("[whatsapp-provider] Tidak ada provider WhatsApp yang dikonfigurasi untuk production");
  return {
    sent: false,
    error:
      "Provider WhatsApp belum dikonfigurasi. Set FONNTE_API_KEY untuk mengaktifkan pengiriman OTP.",
  };
}
