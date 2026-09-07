import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isWhatsappDeliveryDisabled,
  sendInvoiceNotification,
  sendWaWithFile,
} from "../lib/whatsapp";

describe("pengaman WhatsApp saat test", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    vi.unstubAllGlobals();
  });

  it("tidak mengirim pesan atau file ke Fonnte saat NODE_ENV=test", async () => {
    process.env.NODE_ENV = "test";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(isWhatsappDeliveryDisabled()).toBe(true);

    const messageResult = await sendInvoiceNotification({
      phone: "628123456789",
      ownerName: "Pemilik Uji",
      businessName: "[TEST] Toko Uji",
      invoiceNumber: "INV-TEST/001",
      periodLabel: "September 2026",
      totalAmount: 2_500_000,
      dueDate: "2026-09-30",
    });
    const fileResult = await sendWaWithFile(
      "628123456789",
      "Dokumen uji",
      "https://example.com/test.pdf",
    );

    expect(messageResult).toEqual({ ok: true, skipped: true });
    expect(fileResult).toEqual({ ok: true, skipped: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});