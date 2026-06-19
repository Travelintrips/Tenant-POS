import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { tenantPaymentsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

/**
 * Middleware anti-duplikasi pembayaran berdasarkan `referenceId`.
 *
 * Jika body request memiliki `referenceId` yang sudah ada di ledger,
 * langsung kembalikan 409 Conflict sebelum logika utama dijalankan.
 *
 * Dipakai di route yang menerima referenceId dari eksternal (POS, OCR, bank).
 */
export async function antiDuplicatePayment(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const referenceId = req.body?.referenceId as string | undefined;

  if (!referenceId || typeof referenceId !== "string" || referenceId.trim() === "") {
    next();
    return;
  }

  try {
    const [existing] = await db
      .select({ id: tenantPaymentsTable.id, receiptNumber: tenantPaymentsTable.receiptNumber })
      .from(tenantPaymentsTable)
      .where(eq(tenantPaymentsTable.referenceId, referenceId.trim()))
      .limit(1);

    if (existing) {
      res.status(409).json({
        error: `Pembayaran duplikat: referenceId '${referenceId}' sudah pernah diproses`,
        code: "DUPLICATE",
        existingPaymentId: existing.id,
        existingReceiptNumber: existing.receiptNumber,
      });
      return;
    }

    next();
  } catch (err) {
    console.error("[antiDuplicatePayment]", err);
    next();
  }
}
