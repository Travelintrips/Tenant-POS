import { Router, type Request, type Response, type IRouter } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { requireAuth } from "../middlewares/auth";

const UPLOAD_DIR = path.join(process.cwd(), "uploads");

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const LOGO_ALLOWED_MIME = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const DOC_ALLOWED_MIME = new Set(["application/pdf", "image/jpeg", "image/jpg", "image/png"]);
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

function makeStorage(subdir: string) {
  return multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = path.join(UPLOAD_DIR, subdir);
      ensureDir(dir);
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, crypto.randomUUID() + ext);
    },
  });
}

const uploadLogo = multer({
  storage: makeStorage("tenant-logos"),
  limits: { fileSize: MAX_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (LOGO_ALLOWED_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Format tidak diizinkan. Gunakan JPG, PNG, atau WEBP."));
    }
  },
});

const uploadDoc = multer({
  storage: makeStorage("contract-docs"),
  limits: { fileSize: MAX_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (DOC_ALLOWED_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Format tidak diizinkan. Gunakan PDF, JPG, atau PNG."));
    }
  },
});

function runMulter(
  middleware: multer.Multer,
  fieldName: string,
): (req: Request, res: Response) => Promise<void> {
  return (req, res) =>
    new Promise<void>((resolve, reject) => {
      middleware.single(fieldName)(req, res, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
}

const router: IRouter = Router();

router.post("/uploads/tenant-logo", requireAuth, async (req, res) => {
  try {
    await runMulter(uploadLogo, "file")(req, res);
  } catch (err) {
    const msg =
      err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE"
        ? "File terlalu besar. Maksimal 5MB."
        : (err as Error).message ?? "Upload gagal";
    res.status(400).json({ error: msg });
    return;
  }

  if (!req.file) {
    res.status(400).json({ error: "File tidak ditemukan dalam request" });
    return;
  }

  const url = `/uploads/tenant-logos/${req.file.filename}`;
  res.json({ url });
});

router.post("/uploads/contract-document", requireAuth, async (req, res) => {
  try {
    await runMulter(uploadDoc, "file")(req, res);
  } catch (err) {
    const msg =
      err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE"
        ? "File terlalu besar. Maksimal 5MB."
        : (err as Error).message ?? "Upload gagal";
    res.status(400).json({ error: msg });
    return;
  }

  if (!req.file) {
    res.status(400).json({ error: "File tidak ditemukan dalam request" });
    return;
  }

  const url = `/uploads/contract-docs/${req.file.filename}`;
  res.json({ url });
});

export default router;
