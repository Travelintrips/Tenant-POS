import crypto from "crypto";
import { db } from "@workspace/db";
import { otpTokensTable } from "@workspace/db/schema";
import { eq, and, lt } from "drizzle-orm";
import { logger } from "../lib/logger";

const OTP_EXPIRY_MINUTES = Number(process.env.OTP_EXPIRY_MINUTES ?? "5");
const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS ?? "5");

export function normalizePhoneNumber(raw: string): string {
  let phone = raw.replace(/\D/g, "");
  if (phone.startsWith("0")) {
    phone = "62" + phone.slice(1);
  } else if (phone.startsWith("62")) {
    // already normalized
  } else if (phone.startsWith("+62")) {
    phone = "62" + phone.slice(3);
  }
  return phone;
}

function generateOtpPlaintext(): string {
  const digits = crypto.randomInt(0, 999999);
  return digits.toString().padStart(6, "0");
}

function hashOtp(otp: string): string {
  return crypto.createHash("sha256").update(otp).digest("hex");
}

export interface CreateOtpResult {
  success: true;
  devOtp?: string;
}

export async function createOtp(phoneNumber: string): Promise<CreateOtpResult> {
  const normalized = normalizePhoneNumber(phoneNumber);
  const otp = generateOtpPlaintext();
  const hash = hashOtp(otp);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  // Invalidate any existing unexpired OTPs for this number
  await db.delete(otpTokensTable).where(
    and(
      eq(otpTokensTable.phoneNumber, normalized),
      lt(otpTokensTable.expiresAt, new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000 + 1)),
    ),
  );

  await db.insert(otpTokensTable).values({
    phoneNumber: normalized,
    otpHash: hash,
    expiresAt,
    attempts: 0,
  });

  const isDev =
    process.env.NODE_ENV !== "production" ||
    process.env.ENABLE_DEV_LOGIN === "true";

  if (isDev) {
    logger.info({ phoneNumber: normalized }, "[otp] OTP dibuat (dev mode)");
    return { success: true, devOtp: otp };
  }

  return { success: true };
}

export type VerifyOtpResult =
  | { ok: true }
  | { ok: false; reason: "invalid" | "expired" | "max_attempts" | "already_used" };

export async function verifyOtp(
  phoneNumber: string,
  otp: string,
): Promise<VerifyOtpResult> {
  const normalized = normalizePhoneNumber(phoneNumber);
  const hash = hashOtp(otp);
  const now = new Date();

  const [token] = await db
    .select()
    .from(otpTokensTable)
    .where(eq(otpTokensTable.phoneNumber, normalized))
    .orderBy(otpTokensTable.createdAt)
    .limit(1);

  if (!token) {
    return { ok: false, reason: "invalid" };
  }

  if (token.usedAt !== null) {
    return { ok: false, reason: "already_used" };
  }

  if (token.expiresAt < now) {
    return { ok: false, reason: "expired" };
  }

  if (token.attempts >= OTP_MAX_ATTEMPTS) {
    return { ok: false, reason: "max_attempts" };
  }

  if (token.otpHash !== hash) {
    await db
      .update(otpTokensTable)
      .set({ attempts: token.attempts + 1 })
      .where(eq(otpTokensTable.id, token.id));
    return { ok: false, reason: "invalid" };
  }

  await db
    .update(otpTokensTable)
    .set({ usedAt: now })
    .where(eq(otpTokensTable.id, token.id));

  return { ok: true };
}

export async function cleanupExpiredOtps(): Promise<void> {
  await db.delete(otpTokensTable).where(lt(otpTokensTable.expiresAt, new Date()));
}
