import express, { type Express } from "express";
import session from "express-session";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import path from "path";
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

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const isProduction = process.env.NODE_ENV === "production";
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

app.use("/api", router);

export default app;
