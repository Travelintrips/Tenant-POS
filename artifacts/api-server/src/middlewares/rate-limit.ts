import rateLimit, { type Options, ipKeyGenerator } from "express-rate-limit";
import type { Request, Response } from "express";
import { logger } from "../lib/logger";

export const RATE_LIMIT_RESPONSE = {
  error: "Too many requests",
  message: "Terlalu banyak percobaan. Silakan coba lagi beberapa saat.",
};

/**
 * Factory untuk membuat rate limiter.
 * Secara default di-skip ketika NODE_ENV=test atau RATE_LIMIT_DISABLED=true.
 * Untuk test khusus rate limit, pass `skip: () => false` agar limiter selalu aktif.
 */
export function makeRateLimiter(options: {
  max: number;
  windowMs: number;
  name: string;
  skip?: Options["skip"];
}) {
  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) =>
      ipKeyGenerator(req.ip ?? req.socket?.remoteAddress ?? "unknown"),
    handler: (_req: Request, res: Response) => {
      res.status(429).json(RATE_LIMIT_RESPONSE);
    },
    skip:
      options.skip ??
      ((_req: Request) =>
        process.env.RATE_LIMIT_DISABLED === "true" ||
        process.env.NODE_ENV === "test"),
  });
}

function getIp(req: Request): string {
  return req.ip ?? req.socket?.remoteAddress ?? "unknown";
}

function onRateLimitHit(req: Request) {
  logger.warn(
    {
      path: req.path,
      ip: getIp(req),
      userAgent: req.headers["user-agent"],
    },
    "[rate-limit] limit terlampaui",
  );
}

function makeLoggingRateLimiter(options: {
  max: number;
  windowMs: number;
  name: string;
  skip?: Options["skip"];
}) {
  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => ipKeyGenerator(getIp(req)),
    handler: (req: Request, res: Response) => {
      onRateLimitHit(req);
      res.status(429).json(RATE_LIMIT_RESPONSE);
    },
    skip:
      options.skip ??
      ((_req: Request) =>
        process.env.RATE_LIMIT_DISABLED === "true" ||
        process.env.NODE_ENV === "test"),
  });
}

/**
 * 10 req / 15 menit per IP — endpoint dev-login
 * Lebih ketat karena endpoint ini bypass autentikasi normal.
 */
export const devLoginRateLimiter = makeLoggingRateLimiter({
  name: "dev-login",
  max: 10,
  windowMs: 15 * 60 * 1000,
});

/**
 * 20 req / 15 menit per IP — Google OAuth initiate & callback
 */
export const googleAuthRateLimiter = makeLoggingRateLimiter({
  name: "google-auth",
  max: 20,
  windowMs: 15 * 60 * 1000,
});

/**
 * 300 req / 15 menit per IP — /auth/me (sering dipanggil frontend)
 */
export const authMeRateLimiter = makeLoggingRateLimiter({
  name: "auth-me",
  max: 300,
  windowMs: 15 * 60 * 1000,
});

/**
 * 30 req / 15 menit per IP — upload file (logo & dokumen)
 */
export const uploadRateLimiter = makeLoggingRateLimiter({
  name: "upload",
  max: 30,
  windowMs: 15 * 60 * 1000,
});

/**
 * 60 req / 15 menit per IP — aksi payment (create / void / refund)
 */
export const paymentRateLimiter = makeLoggingRateLimiter({
  name: "payment",
  max: 60,
  windowMs: 15 * 60 * 1000,
});

/** 5 request OTP / 15 menit per nomor+IP */
export const otpRequestRateLimiter = makeLoggingRateLimiter({
  name: "otp-request",
  max: 5,
  windowMs: 15 * 60 * 1000,
});

/** 20 request OTP / 15 menit per IP */
export const otpRequestIpRateLimiter = makeLoggingRateLimiter({
  name: "otp-request-ip",
  max: 20,
  windowMs: 15 * 60 * 1000,
});

/** 10 verifikasi OTP / 15 menit per IP */
export const otpVerifyRateLimiter = makeLoggingRateLimiter({
  name: "otp-verify",
  max: 10,
  windowMs: 15 * 60 * 1000,
});

/**
 * 5 pendaftaran / 10 menit per IP — self-registration calon tenant (publik)
 * Melindungi endpoint POST /api/calon-tenant/daftar dari spam.
 */
export const registrationRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => ipKeyGenerator(getIp(req)),
  handler: (req: Request, res: Response) => {
    logger.warn(
      {
        path: req.path,
        ip: getIp(req),
        userAgent: req.headers["user-agent"],
      },
      "[rate-limit] registrasi calon tenant: limit terlampaui",
    );
    res.status(429).json({
      success: false,
      message: "Terlalu banyak percobaan pendaftaran. Silakan coba lagi beberapa menit lagi.",
    });
  },
  skip: (_req: Request) =>
    process.env.RATE_LIMIT_DISABLED === "true" ||
    process.env.NODE_ENV === "test",
});
