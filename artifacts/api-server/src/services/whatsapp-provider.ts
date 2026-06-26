import { logger } from "../lib/logger";

export interface SendOtpResult {
  sent: boolean;
  error?: string;
}

async function sendViaFonnte(phoneNumber: string, otp: string): Promise<SendOtpResult> {
  const apiKey = process.env.FONNTE_API_KEY ?? process.env.FONNTE_TOKEN;
  const sender = process.env.FONNTE_SENDER ?? "";

  if (!apiKey) {
    return { sent: false, error: "FONNTE_API_KEY atau FONNTE_TOKEN tidak dikonfigurasi" };
  }

  const message = `Kode OTP Portal Admin Mall Anda: *${otp}*\n\nBerlaku ${process.env.OTP_EXPIRY_MINUTES ?? "5"} menit. Jangan bagikan kode ini kepada siapapun.`;

  const body = new URLSearchParams({
    target: phoneNumber,
    message,
    ...(sender ? { sender } : {}),
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);

  let res: Response;
  try {
    res = await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
      signal: controller.signal,
    });
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const isTimeout = err instanceof Error && err.name === "AbortError";
    logger.error({ phoneNumber, err }, isTimeout ? "[fonnte] timeout 15s" : "[fonnte] fetch error");
    return { sent: false, error: isTimeout ? "Fonnte timeout" : String(err) };
  } finally {
    clearTimeout(timeoutId);
  }

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
  if (!otp) {
    logger.error("[whatsapp-provider] OTP kosong — tidak dikirim");
    return { sent: false, error: "OTP tidak boleh kosong" };
  }

  const hasToken = !!(process.env.FONNTE_API_KEY ?? process.env.FONNTE_TOKEN);

  if (!hasToken) {
    // Tidak ada token → skip (dev tanpa Fonnte)
    logger.info({ phoneNumber }, "[whatsapp-provider] Tidak ada FONNTE token — OTP tidak dikirim via WA");
    return { sent: true };
  }

  return sendViaFonnte(phoneNumber, otp);
}
