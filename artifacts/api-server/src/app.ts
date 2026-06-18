import express, { type Express, type Request, type Response, type NextFunction } from "express";
import session from "express-session";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import path from "path";
import fs from "fs";
import passport from "./lib/auth";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// ─── Security headers (Helmet) ─────────────────────────────────────────────
// CSP dinonaktifkan di sini karena frontend (admin-portal) berjalan di domain/
// port berbeda dan mengelola CSP-nya sendiri via Vite. Aktifkan CSP di sini
// hanya jika API dan frontend digabung dalam satu origin.
//
// crossOriginEmbedderPolicy: false agar static uploads (gambar/PDF) tetap bisa
// di-load cross-origin oleh frontend tanpa butuh header COEP dari subresource.
//
// crossOriginResourcePolicy: cross-origin agar logo/dokumen bisa di-fetch dari
// frontend yang berjalan di port/domain berbeda (development maupun production).
//
// frameguard sameorigin: API tidak perlu di-embed iframe, tapi sameorigin lebih
// aman daripada deny untuk kasus reverse-proxy single-domain.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginOpenerPolicy: { policy: "same-origin" },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    frameguard: { action: "sameorigin" },
  }),
);

const isProduction = process.env.NODE_ENV === "production";

// ─── CORS ──────────────────────────────────────────────────────────────────
// Development  : semua origin diizinkan (origin: true) agar Vite proxy dan
//               tool lokal bisa bekerja tanpa konfigurasi tambahan.
//
// Production   : hanya origin yang ada di ALLOWED_ORIGINS (comma-separated)
//               yang boleh mengirim request dengan credentials. Request
//               same-origin (tanpa header Origin) selalu diizinkan.
//               Jika ALLOWED_ORIGINS tidak diset, semua request cross-origin
//               dengan credentials ditolak — sesuai dengan arsitektur
//               Replit deployment di mana frontend dan API berada di domain
//               yang sama (same-origin via reverse-proxy).
//
// CATATAN: Webhook Fonnte (/api/whatsapp-webhook/*) tidak butuh credentials
//          sehingga penolakan CORS di sini tidak menghalangi webhook.
const allowedOrigins: string[] = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
  : [];

app.use(
  cors({
    origin: isProduction
      ? (origin, callback) => {
          if (!origin) return callback(null, true);
          if (allowedOrigins.length > 0 && allowedOrigins.includes(origin)) {
            return callback(null, true);
          }
          logger.warn({ origin }, "[cors] Cross-origin request ditolak di production");
          return callback(null, false);
        }
      : true,
    credentials: true,
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const sessionSecret = process.env.SESSION_SECRET ?? "fallback-dev-secret";

if (isProduction && sessionSecret === "fallback-dev-secret") {
  logger.warn("SESSION_SECRET menggunakan nilai default! Wajib diganti sebelum production.");
}

app.use(
  session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "strict" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  }),
);

app.use(passport.initialize());
app.use(passport.session());

app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

app.get("/api/healthz", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api", router);

// ─── Serve admin portal static files ─────────────────────────────────────
// Di development, Vite proxy menangani routing antar API dan frontend.
// Di production (termasuk NODE_ENV=development di container Replit), Express
// serve file statis dari build admin portal jika folder dist ada,
// dengan fallback ke index.html untuk semua route non-API (SPA behavior).
// Ini yang memungkinkan /bayar/:token dan halaman lain bisa diakses langsung.
const frontendDist = path.join(process.cwd(), "artifacts/admin-portal/dist/public");
const frontendIndex = path.join(frontendDist, "index.html");
if (fs.existsSync(frontendDist)) {
  logger.info({ frontendDist }, "[app] Serving admin portal static files");
  app.use(express.static(frontendDist, { maxAge: "1d", etag: true }));
  // Express 5 + path-to-regexp v8: wildcard harus pakai "/{*path}", bukan "*"
  app.get("/{*path}", (_req, res) => {
    res.sendFile(frontendIndex);
  });
} else {
  // Fallback: GET / selalu 200 agar Cloud Run health check lulus
  // meski frontend belum di-build (misal saat pertama deploy).
  app.get("/", (_req, res) => {
    res.status(200).json({ status: "ok", service: "Mall Admin API" });
  });
}

// ─── Global error handler ──────────────────────────────────────────────────
// Tangani error yang tidak ter-catch di route handlers. Di production, hanya
// pesan generik yang dikembalikan ke client — stack trace TIDAK bocor.
// Di development, detail error dan stack trace ditampilkan untuk memudahkan
// debugging.
//
// Middleware error Express WAJIB 4 parameter (err, req, res, next).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err }, "[app] Unhandled error");

  if (res.headersSent) return;

  if (isProduction) {
    res.status(500).json({ error: "Terjadi kesalahan internal server. Silakan coba lagi." });
  } else {
    res.status(500).json({
      error: err.message ?? "Internal server error",
      stack: err.stack,
    });
  }
});

export default app;
