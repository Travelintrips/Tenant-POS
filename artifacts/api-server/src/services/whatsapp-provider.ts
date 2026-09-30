import { logger } from "../lib/logger";
import { sendGatewayText } from "../lib/whatsapp-gateway-client";

export interface SendOtpResult {
  sent: boolean;
  error?: string;
}

export async function sendOtpWhatsapp(
  phoneNumber: string,
  otp: string,
): Promise<SendOtpResult> {
  if (!otp) {
    logger.error("[whatsapp-provider] OTP kosong — tidak dikirim");
    return { sent: false, error: "OTP tidak boleh kosong" };
  }

  const message = `Kode OTP Portal Admin Mall Anda: *${otp}*\n\nBerlaku ${process.env.OTP_EXPIRY_MINUTES ?? "5"} menit. Jangan bagikan kode ini kepada siapapun.`;
  const result = await sendGatewayText(phoneNumber, message);

  if (result.skipped) {
    if (process.env.NODE_ENV === "production") {
      logger.error("[whatsapp-provider] CST WA Gateway belum dikonfigurasi di production");
      return { sent: false, error: "CST_WA_GATEWAY_TOKEN belum dikonfigurasi" };
    }

    logger.info(
      { phoneNumber },
      "[whatsapp-provider] CST WA Gateway belum dikonfigurasi — OTP tidak dikirim via WA di non-production",
    );
    return { sent: true };
  }

  if (!result.ok) {
    logger.error({ phoneNumber, error: result.error }, "[whatsapp-provider] CST WA Gateway gagal mengirim OTP");
    return { sent: false, error: result.error ?? "CST WA Gateway gagal" };
  }

  return { sent: true };
}
