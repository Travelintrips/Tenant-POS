import express, { type Express, type Request, type Response, type NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { Pool } from "pg";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import path from "path";
import fs from "fs";
import crypto from "crypto";
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

// ─── SESSION_SECRET ────────────────────────────────────────────────────────
// Di production, SESSION_SECRET wajib diset di Replit Secrets.
// Di development, auto-generate secret acak jika tidak diset agar server
// tidak pernah gagal start hanya karena secret belum dikonfigurasi.
// CATATAN: auto-generated secret bersifat ephemeral — sesi akan invalid
// setiap kali server restart. Tambahkan SESSION_SECRET ke Secrets untuk
// sesi yang persisten.
let sessionSecret = process.env.SESSION_SECRET ?? "";

if (!sessionSecret) {
  if (isProduction) {
    logger.warn("SESSION_SECRET tidak diset di production! Menggunakan secret acak — semua sesi akan hilang saat restart.");
  } else {
    logger.info("SESSION_SECRET tidak diset — menggunakan secret acak untuk development. Tambahkan SESSION_SECRET ke Secrets untuk sesi yang persisten.");
  }
  sessionSecret = crypto.randomBytes(32).toString("hex");
}

// ─── PostgreSQL Session Store ──────────────────────────────────────────────
// Sesi disimpan ke PostgreSQL agar tidak hilang saat server restart.
// Tabel `session` harus sudah ada di DB (dibuat oleh migration 0069).
// Prioritas URL DB konsisten dengan lib/db/src/config.ts:
//   dev  : SUPABASE_PG_URL_DEV → SUPABASE_DATABASE_URL_DEV → DATABASE_URL
//   prod : SUPABASE_PG_URL_PROD → SUPABASE_PG_URL → DATABASE_URL
const sessionDbUrl =
  isProduction
    ? (process.env.SUPABASE_PG_URL_PROD ?? process.env.SUPABASE_PG_URL ?? process.env.DATABASE_URL ?? "")
    : (process.env.SUPABASE_PG_URL_DEV ?? process.env.SUPABASE_DATABASE_URL_DEV ?? process.env.DATABASE_URL ?? "");

const PgSession = connectPgSimple(session);
// Tambahkan options search_path=public agar Supabase PgBouncer (port 6543)
// bisa menemukan tabel `session` di schema public (search_path tidak di-set otomatis).
const sessionPool = new Pool({
  connectionString: sessionDbUrl,
  options: "-c search_path=public",
});

app.use(
  session({
    store: new PgSession({
      pool: sessionPool,
      tableName: "session",
      schemaName: "public",
      createTableIfMissing: false,
    }),
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
  // SPA fallback: app.use() tanpa path — tidak melalui path-to-regexp sama sekali.
  // Semua request yang lolos dari static + /api handler diarahkan ke index.html.
  app.use((_req, res) => {
    res.sendFile(frontendIndex);
  });
} else {
  // Fallback: GET / selalu 200 agar Cloud Run health check lulus
  // meski frontend belum di-build (misal saat pertama deploy).
  app.use((_req, res, next) => {
    if (_req.path === "/" && _req.method === "GET") {
      res.status(200).json({ status: "ok", service: "Mall Admin API" });
    } else {
      next();
    }
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
