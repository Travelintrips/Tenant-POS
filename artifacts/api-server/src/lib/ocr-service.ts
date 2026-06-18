import path from "node:path";
import os from "node:os";

export interface OcrResult {
  extractedAmount: number | null;
  rawText: string;
  confidence: number;
}

function parseAmount(text: string): { amount: number | null; confidence: number } {
  // 1. Hapus bagian yang berpotensi noise: tanggal, no referensi, dll.
  const scrubbed = text
    .replace(/\u2019/g, "'")
    .replace(/\u2018/g, "'")
    .replace(/[^\S\r\n]+/g, " ")
    // Hapus pola tanggal: DD/MM/YYYY, YYYY-MM-DD, DD-MM-YYYY, 17062026, 20240617
    .replace(/\b\d{2}[\/\-]\d{2}[\/\-]\d{4}\b/g, "")
    .replace(/\b\d{4}[\/\-]\d{2}[\/\-]\d{2}\b/g, "")
    // Hapus teks setelah kata "ref", "no ref", "no. ref", "kode", "nomor"
    .replace(/(?:no\.?\s*ref(?:erensi)?|ref(?:erensi)?|kode|nomor\s*resi|kode\s*unik)\s*[:\.\-]?\s*[\w\d]+/gi, "");

  const candidates: { val: number; fromPrefix: boolean }[] = [];

  // 2) Rp / IDR prefix — tertinggi prioritasnya
  const prefixRe = /(?:Rp\.?\s*|IDR\s*)([\d.,]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = prefixRe.exec(scrubbed)) !== null) {
    const n = normaliseNumber(m[1]);
    if (n !== null) candidates.push({ val: n, fromPrefix: true });
  }

  // 3) Dot-thousands: 1.000.000
  const dotThousands = /\b(\d{1,3}(?:\.\d{3})+)\b/g;
  while ((m = dotThousands.exec(scrubbed)) !== null) {
    const n = parseInt(m[1].replace(/\./g, ""), 10);
    if (isReasonable(n)) candidates.push({ val: n, fromPrefix: false });
  }

  // 4) Comma-thousands: 1,000,000
  const commaThousands = /\b(\d{1,3}(?:,\d{3})+)\b/g;
  while ((m = commaThousands.exec(scrubbed)) !== null) {
    const n = parseInt(m[1].replace(/,/g, ""), 10);
    if (isReasonable(n)) candidates.push({ val: n, fromPrefix: false });
  }

  // 5) Plain 4-10 digit (fallback, hanya jika tidak ada kandidat Rp)
  const prefixOnly = candidates.filter((c) => c.fromPrefix);
  if (prefixOnly.length === 0) {
    const plain = /\b(\d{4,10})\b/g;
    while ((m = plain.exec(scrubbed)) !== null) {
      const n = parseInt(m[1], 10);
      // Buang yang mirip tanggal YYYYMMDD atau DDMMYYYY
      if (isDateLike(n)) continue;
      if (isReasonable(n)) candidates.push({ val: n, fromPrefix: false });
    }
  }

  if (candidates.length === 0) return { amount: null, confidence: 0 };

  // Prioritaskan yang punya prefix Rp/IDR, ambil terbesar di antara grup itu
  const withPrefix = candidates.filter((c) => c.fromPrefix);
  const pool = withPrefix.length > 0 ? withPrefix : candidates;
  const best = pool.sort((a, b) => b.val - a.val)[0].val;

  const hasPrefix = withPrefix.length > 0;
  const confidence = hasPrefix ? 0.9 : candidates.length >= 2 ? 0.7 : 0.5;

  return { amount: best, confidence };
}

function isDateLike(n: number): boolean {
  const s = String(n);
  if (s.length === 8) {
    // YYYYMMDD: 20000101 – 20991231
    const y = parseInt(s.slice(0, 4), 10);
    const m = parseInt(s.slice(4, 6), 10);
    const d = parseInt(s.slice(6, 8), 10);
    if (y >= 2000 && y <= 2099 && m >= 1 && m <= 12 && d >= 1 && d <= 31) return true;
    // DDMMYYYY: 01012000 – 31122099
    const d2 = parseInt(s.slice(0, 2), 10);
    const m2 = parseInt(s.slice(2, 4), 10);
    const y2 = parseInt(s.slice(4, 8), 10);
    if (y2 >= 2000 && y2 <= 2099 && m2 >= 1 && m2 <= 12 && d2 >= 1 && d2 <= 31) return true;
  }
  return false;
}

function normaliseNumber(s: string): number | null {
  // Remove trailing decimals (cents) if pattern is like 1.000.000,00
  const trimmed = s.replace(/[,.](\d{1,2})$/, "").replace(/[.,]/g, "");
  const n = parseInt(trimmed, 10);
  return isReasonable(n) ? n : null;
}

function isReasonable(n: number): boolean {
  return !isNaN(n) && n >= 1_000 && n <= 999_999_999_999;
}

export async function extractAmountFromFile(
  buffer: Buffer,
  mimetype: string,
): Promise<OcrResult> {
  try {
    if (mimetype === "application/pdf") {
      return await extractFromPdf(buffer);
    }
    return await extractFromImage(buffer);
  } catch {
    return { extractedAmount: null, rawText: "", confidence: 0 };
  }
}

async function extractFromPdf(buffer: Buffer): Promise<OcrResult> {
  try {
    const mod = await import("pdf-parse");
    const pdfParse: (buf: Buffer) => Promise<{ text: string }> =
      (mod as any).default ?? mod;
    const parsed = await pdfParse(buffer);
    const rawText = (parsed.text ?? "").trim();
    if (!rawText) return { extractedAmount: null, rawText: "", confidence: 0 };
    const { amount, confidence } = parseAmount(rawText);
    return { extractedAmount: amount, rawText: rawText.slice(0, 3000), confidence };
  } catch {
    return { extractedAmount: null, rawText: "", confidence: 0 };
  }
}

const IMAGE_MAGIC: Array<{ prefix: number[]; mime: string }> = [
  { prefix: [0xff, 0xd8, 0xff], mime: "image/jpeg" },
  { prefix: [0x89, 0x50, 0x4e, 0x47], mime: "image/png" },
  { prefix: [0x47, 0x49, 0x46], mime: "image/gif" },
  { prefix: [0x52, 0x49, 0x46, 0x46], mime: "image/webp" },
];

function hasValidImageMagic(buf: Buffer): boolean {
  if (buf.length < 16) return false;
  return IMAGE_MAGIC.some(({ prefix }) =>
    prefix.every((b, i) => buf[i] === b),
  );
}

async function extractFromImage(buffer: Buffer): Promise<OcrResult> {
  if (!hasValidImageMagic(buffer)) {
    return { extractedAmount: null, rawText: "", confidence: 0 };
  }

  return new Promise((resolve) => {
    (async () => {
      try {
        const Tesseract = await import("tesseract.js");
        const cachePath = path.join(os.tmpdir(), "tesseract-cache");
        const worker = await Tesseract.createWorker("ind+eng", 1, {
          cachePath,
          logger: () => {},
        });
        try {
          const { data } = await worker.recognize(buffer);
          const rawText = (data.text ?? "").trim();
          if (!rawText) {
            resolve({ extractedAmount: null, rawText: "", confidence: 0 });
            return;
          }
          const { amount, confidence } = parseAmount(rawText);
          resolve({
            extractedAmount: amount,
            rawText: rawText.slice(0, 3000),
            confidence: Math.min(confidence, (data.confidence ?? 0) / 100),
          });
        } finally {
          await worker.terminate().catch(() => {});
        }
      } catch {
        resolve({ extractedAmount: null, rawText: "", confidence: 0 });
      }
    })();
  });
}
