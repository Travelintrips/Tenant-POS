import { describe, expect, it } from "vitest";
import { isLikelyYearAmount, parseAmountFromText } from "../lib/ocr-service";

describe("OCR nominal pembayaran", () => {
  it("tidak menganggap tahun tunggal sebagai nominal", () => {
    expect(parseAmountFromText("Tanggal transfer 01 September 2026").amount).toBeNull();
    expect(isLikelyYearAmount(2026)).toBe(true);
  });

  it("memilih nominal rupiah dan mengabaikan tahun pada bukti", () => {
    const result = parseAmountFromText(
      "Transfer berhasil\nTanggal 01/09/2026\nJumlah Rp 3.050.000\n",
    );

    expect(result.amount).toBe(3_050_000);
    expect(result.confidence).toBe(0.98);
  });


  it("memilih Nominal transfer, bukan Total yang sudah termasuk biaya", () => {
    const result = parseAmountFromText(
      "Transfer berhasil\nRp3.000.000\nDetail transfer\nNominal Rp3.000.000\nBiaya transaksi Rp2.500\nTotal Rp3.002.500",
    );

    expect(result.amount).toBe(3_000_000);
    expect(result.confidence).toBe(0.98);
  });

  it("mengenali nominal bertanda pemisah ribuan tanpa prefix", () => {
    const result = parseAmountFromText("01 September 2026\nTotal transfer 3.050.000");

    expect(result.amount).toBe(3_050_000);
  });
});