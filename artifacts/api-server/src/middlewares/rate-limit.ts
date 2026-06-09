import rateLimit, { type Options } from "express-rate-limit";
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
      (req.headers["x-forwarded-for"] as string | undefined)
        ?.split(",")[0]
        ?.trim() ?? req.ip ?? "unknown",
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

function onRateLimitHit(req: Request) {
  logger.warn(
    {
      path: req.path,
      ip:
        (req.headers["x-forwarded-for"] as string | undefined)
          ?.split(",")[0]
          ?.trim() ?? req.ip,
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
    keyGenerator: (req: Request) =>
      (req.headers["x-forwarded-for"] as string | undefined)
        ?.split(",")[0]
        ?.trim() ?? req.ip ?? "unknown",
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
 * 30 req / 15 menit per IP — endpoint dev-login
 * Development/staging: aktif. Production: tidak relevan karena route tidak terdaftar.
 */
export const devLoginRateLimiter = makeLoggingRateLimiter({
  name: "dev-login",
  max: 30,
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
 * Cukup longgar agar kasir tidak terganggu saat operasional.
 */
export const paymentRateLimiter = makeLoggingRateLimiter({
  name: "payment",
  max: 60,
  windowMs: 15 * 60 * 1000,
});
