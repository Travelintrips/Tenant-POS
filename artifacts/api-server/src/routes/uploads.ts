import { Router, type Request, type Response, type IRouter } from "express";
import multer from "multer";
import crypto from "crypto";
import path from "path";
import { requireAuth } from "../middlewares/auth";
import { uploadRateLimiter } from "../middlewares/rate-limit";
import { uploadToStorage } from "../lib/supabase-storage";

const LOGO_ALLOWED_MIME = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const DOC_ALLOWED_MIME = new Set(["application/pdf", "image/jpeg", "image/jpg", "image/png", "image/webp"]);
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

const memStorage = multer.memoryStorage();

const uploadLogo = multer({
  storage: memStorage,
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
  storage: memStorage,
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

router.post("/uploads/tenant-logo", uploadRateLimiter, requireAuth, async (req, res) => {
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

  try {
    const ext = path.extname(req.file.originalname).toLowerCase() || ".png";
    const filename = `${crypto.randomUUID()}${ext}`;
    const url = await uploadToStorage(
      "tenant-logos",
      filename,
      req.file.buffer,
      req.file.mimetype,
    );
    res.json({ url });
  } catch (err) {
    req.log?.error(err, "Upload tenant logo gagal");
    res.status(500).json({ error: "Gagal menyimpan file ke storage" });
  }
});

router.post("/uploads/mall-logo", uploadRateLimiter, requireAuth, async (req, res) => {
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

  try {
    const ext = path.extname(req.file.originalname).toLowerCase() || ".png";
    const filename = `mall-logo-${crypto.randomUUID()}${ext}`;
    const url = await uploadToStorage(
      "tenant-logos",
      filename,
      req.file.buffer,
      req.file.mimetype,
    );
    res.json({ url });
  } catch (err) {
    req.log?.error(err, "Upload mall logo gagal");
    res.status(500).json({ error: "Gagal menyimpan file ke storage" });
  }
});

router.post("/uploads/contract-document", uploadRateLimiter, requireAuth, async (req, res) => {
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

  try {
    const ext = path.extname(req.file.originalname).toLowerCase() || ".pdf";
    const filename = `${crypto.randomUUID()}${ext}`;
    const url = await uploadToStorage(
      "contract-docs",
      filename,
      req.file.buffer,
      req.file.mimetype,
    );
    res.json({ url });
  } catch (err) {
    req.log?.error(err, "Upload contract document gagal");
    res.status(500).json({ error: "Gagal menyimpan file ke storage" });
  }
});

// ─── POST /api/uploads/expense-receipt ────────────────────────────────────────
// Upload bukti pengeluaran + OCR otomatis untuk baca nominal
router.post("/uploads/expense-receipt", uploadRateLimiter, requireAuth, async (req, res) => {
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

  try {
    const { extractAmountFromFile } = await import("../lib/ocr-service");
    const ext = path.extname(req.file.originalname).toLowerCase() || ".jpg";
    const filename = `expense-${crypto.randomUUID()}${ext}`;

    const [url, ocr] = await Promise.all([
      uploadToStorage("expense-receipts", filename, req.file.buffer, req.file.mimetype),
      extractAmountFromFile(req.file.buffer, req.file.mimetype),
    ]);

    res.json({
      url,
      extractedAmount: ocr.extractedAmount,
      confidence: ocr.confidence,
      rawText: ocr.rawText.slice(0, 500),
    });
  } catch (err) {
    req.log?.error(err, "Upload expense receipt gagal");
    res.status(500).json({ error: "Gagal menyimpan bukti pengeluaran" });
  }
});

export default router;
