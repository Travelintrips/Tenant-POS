import path from "node:path";
import os from "node:os";

export interface OcrResult {
  extractedAmount: number | null;
  rawText: string;
  confidence: number;
}

function parseAmount(text: string): { amount: number | null; confidence: number } {
  const candidates: number[] = [];

  const normalised = text
    .replace(/\u2019/g, "'")
    .replace(/\u2018/g, "'")
    .replace(/[^\S\r\n]+/g, " ");

  // 1) Rp / IDR prefix — highest confidence
  const prefixRe = /(?:Rp\.?\s*|IDR\s*)([\d.,]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = prefixRe.exec(normalised)) !== null) {
    const n = normaliseNumber(m[1]);
    if (n !== null) candidates.push(n);
  }

  // 2) Dot-thousands: 1.000.000
  const dotThousands = /\b(\d{1,3}(?:\.\d{3})+)\b/g;
  while ((m = dotThousands.exec(normalised)) !== null) {
    const n = parseInt(m[1].replace(/\./g, ""), 10);
    if (isReasonable(n)) candidates.push(n);
  }

  // 3) Comma-thousands: 1,000,000
  const commaThousands = /\b(\d{1,3}(?:,\d{3})+)\b/g;
  while ((m = commaThousands.exec(normalised)) !== null) {
    const n = parseInt(m[1].replace(/,/g, ""), 10);
    if (isReasonable(n)) candidates.push(n);
  }

  // 4) Plain 4+ digit number (fallback)
  const plain = /\b(\d{4,12})\b/g;
  while ((m = plain.exec(normalised)) !== null) {
    const n = parseInt(m[1], 10);
    if (isReasonable(n)) candidates.push(n);
  }

  if (candidates.length === 0) return { amount: null, confidence: 0 };

  // Pick the largest reasonable value
  const best = candidates.sort((a, b) => b - a)[0];

  const hasPrefix = /(?:Rp\.?\s*|IDR\s*)[\d.,]{4,}/i.test(normalised);
  const confidence = hasPrefix ? 0.9 : candidates.length >= 2 ? 0.7 : 0.5;

  return { amount: best, confidence };
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

async function extractFromImage(buffer: Buffer): Promise<OcrResult> {
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
      if (!rawText) return { extractedAmount: null, rawText: "", confidence: 0 };
      const { amount, confidence } = parseAmount(rawText);
      return {
        extractedAmount: amount,
        rawText: rawText.slice(0, 3000),
        confidence: Math.min(confidence, (data.confidence ?? 0) / 100),
      };
    } finally {
      await worker.terminate();
    }
  } catch {
    return { extractedAmount: null, rawText: "", confidence: 0 };
  }
}
