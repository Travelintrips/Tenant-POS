import { Router, type IRouter } from "express";
import { z } from "zod";
import { createOtp, verifyOtp, normalizePhoneNumber } from "../services/otp-service";
import { sendOtpWhatsapp } from "../services/whatsapp-provider";
import { findOrCreateUserByPhone, buildSessionUser } from "../lib/auth";
import { logAudit } from "../lib/audit";
import { logger } from "../lib/logger";
import { otpRequestRateLimiter, otpRequestIpRateLimiter, otpVerifyRateLimiter } from "../middlewares/rate-limit";

const router: IRouter = Router();

const requestOtpSchema = z.object({
  phoneNumber: z.string().min(8).max(20),
});

const verifyOtpSchema = z.object({
  phoneNumber: z.string().min(8).max(20),
  otp: z.string().length(6),
});

router.post(
  "/auth/whatsapp/request-otp",
  otpRequestIpRateLimiter,
  otpRequestRateLimiter,
  async (req, res) => {
    const parsed = requestOtpSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Format nomor WhatsApp tidak valid" });
      return;
    }

    const normalized = normalizePhoneNumber(parsed.data.phoneNumber);

    const user = await findOrCreateUserByPhone({ phoneNumber: normalized });

    const GENERIC_MESSAGE = "Jika nomor terdaftar, kode OTP akan dikirim.";

    if (!user) {
      logger.info({ phoneNumber: normalized }, "[wa-otp] nomor tidak ditemukan");
      res.json({ message: GENERIC_MESSAGE });
      return;
    }

    const result = await createOtp(normalized);

    if (result.devOtp) {
      logAudit(req, {
        action: "whatsapp_otp_requested",
        entityType: "user",
        entityId: user.id,
        afterData: { phoneNumber: normalized },
      });
      res.json({ message: GENERIC_MESSAGE, devOtp: result.devOtp });
      return;
    }

    const sent = await sendOtpWhatsapp(normalized, result.devOtp ?? "");
    if (!sent.sent) {
      logger.error({ error: sent.error }, "[wa-otp] gagal kirim OTP");
      res.status(500).json({ error: "Gagal mengirim OTP. Silakan coba lagi." });
      return;
    }

    logAudit(req, {
      action: "whatsapp_otp_requested",
      entityType: "user",
      entityId: user.id,
      afterData: { phoneNumber: normalized },
    });

    res.json({ message: GENERIC_MESSAGE });
  },
);

router.post(
  "/auth/whatsapp/verify-otp",
  otpVerifyRateLimiter,
  async (req, res) => {
    const parsed = verifyOtpSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Data tidak valid" });
      return;
    }

    const { phoneNumber, otp } = parsed.data;
    const normalized = normalizePhoneNumber(phoneNumber);

    const verifyResult = await verifyOtp(normalized, otp);

    if (!verifyResult.ok) {
      const messages: Record<string, string> = {
        invalid: "Kode OTP tidak valid",
        expired: "Kode OTP sudah kedaluwarsa",
        max_attempts: "Terlalu banyak percobaan. Minta kode OTP baru.",
        already_used: "Kode OTP sudah digunakan",
      };
      logAudit(req, {
        action: "whatsapp_login_failed",
        entityType: "user",
        afterData: { phoneNumber: normalized, reason: verifyResult.reason },
      });
      res.status(401).json({ error: messages[verifyResult.reason] ?? "OTP tidak valid" });
      return;
    }

    const dbUser = await findOrCreateUserByPhone({ phoneNumber: normalized });
    if (!dbUser) {
      res.status(401).json({ error: "Akun tidak ditemukan atau tidak aktif" });
      return;
    }

    const sessionUser = await buildSessionUser(dbUser);

    req.login(sessionUser, async (err) => {
      if (err) {
        logger.error({ err }, "[wa-otp] req.login gagal");
        res.status(500).json({ error: "Login gagal" });
        return;
      }

      logAudit(req, {
        action: "whatsapp_login_success",
        entityType: "user",
        entityId: dbUser.id,
        afterData: { phoneNumber: normalized, role: dbUser.role },
      });

      res.json(sessionUser);
    });
  },
);

export default router;
