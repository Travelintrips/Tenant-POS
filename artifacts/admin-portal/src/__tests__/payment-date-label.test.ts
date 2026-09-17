import { describe, expect, it } from "vitest";
import { getPaymentDateLabel } from "@/lib/payment-date-label";

describe("getPaymentDateLabel", () => {
  it("uses approval date for OCR/upload proof payments", () => {
    expect(getPaymentDateLabel("ocr")).toBe("Tanggal Disetujui");
    expect(getPaymentDateLabel("upload")).toBe("Tanggal Disetujui");
  });

  it("uses bank transaction date for bank reconciliation payments", () => {
    expect(getPaymentDateLabel("bank")).toBe("Tanggal Transaksi Bank");
    expect(getPaymentDateLabel("bank_recon")).toBe("Tanggal Transaksi Bank");
  });

  it("uses payment date for manual and POS payments", () => {
    expect(getPaymentDateLabel("manual")).toBe("Tanggal Pembayaran");
    expect(getPaymentDateLabel("pos")).toBe("Tanggal Pembayaran");
  });

  it("falls back to payment date for legacy or unknown sources", () => {
    expect(getPaymentDateLabel(null)).toBe("Tanggal Pembayaran");
    expect(getPaymentDateLabel("legacy")).toBe("Tanggal Pembayaran");
  });
});