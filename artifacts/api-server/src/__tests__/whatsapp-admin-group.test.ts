import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("admin WhatsApp group delivery log", () => {
  const originalGroup = process.env.ADMIN_WA_GROUP;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.resetModules();
    process.env.ADMIN_WA_GROUP = "12036341119221335@g.us";
  });

  afterEach(() => {
    vi.doUnmock("@workspace/db");
    vi.doUnmock("../lib/whatsapp-gateway-client");
    vi.resetModules();
    process.env.NODE_ENV = originalNodeEnv;
    if (originalGroup === undefined) {
      delete process.env.ADMIN_WA_GROUP;
    } else {
      process.env.ADMIN_WA_GROUP = originalGroup;
    }
  });

  it("mencatat status delivery group meskipun pengiriman di-skip pada test runtime", async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    const insert = vi.fn(() => ({ values }));

    vi.doMock("@workspace/db", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@workspace/db")>();
      return {
        ...actual,
        db: {
          ...actual.db,
          insert,
        },
      };
    });

    const { notifyAdminGroup } = await import("../lib/whatsapp");

    const result = await notifyAdminGroup({
      eventType: "overdue",
      businessName: "Tenant Test",
      ownerName: "Owner Test",
      invoiceNumber: "INV-TEST-001",
      amount: "100000",
      siteId: 1,
      tenantId: 2,
      invoiceId: 3,
    });

    expect(result).toMatchObject({ ok: true, skipped: true });
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        siteId: 1,
        tenantId: 2,
        invoiceId: 3,
        phone: "12036341119221335@g.us",
        messageType: "admin_group_overdue",
        status: "skipped",
        sentBy: "admin_group",
      }),
    );
  });

  it("tidak mengantrikan ulang notifikasi group yang sudah diterima CST WA Gateway", async () => {
    process.env.NODE_ENV = "development";

    const values = vi.fn().mockResolvedValue(undefined);
    const insert = vi.fn(() => ({ values }));
    const sendGatewayText = vi.fn().mockResolvedValue({
      ok: true,
      queued: true,
      messageId: "msg-queued-1",
    });

    vi.doMock("@workspace/db", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@workspace/db")>();
      return {
        ...actual,
        db: {
          ...actual.db,
          insert,
        },
      };
    });

    vi.doMock("../lib/whatsapp-gateway-client", () => ({
      sendGatewayText,
      sendGatewayMedia: vi.fn(),
    }));

    const { notifyAdminGroup } = await import("../lib/whatsapp");
    const params = {
      eventType: "payment_approved" as const,
      businessName: "Tenant Queue Test",
      ownerName: "Owner Test",
      invoiceNumber: "INV-QUEUE-001",
      receiptNumber: "RCPT-QUEUE-001",
      amount: "250000",
      siteId: 1,
      tenantId: 2,
      invoiceId: 3,
    };

    const first = await notifyAdminGroup(params);
    const second = await notifyAdminGroup(params);

    expect(first).toMatchObject({ ok: true, pending: true });
    expect(second).toMatchObject({ ok: true, pending: true });
    expect(sendGatewayText).toHaveBeenCalledTimes(1);
    expect(values).toHaveBeenCalledTimes(1);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "queued",
        errorMessage: null,
        messageType: "admin_group_payment_approved",
      }),
    );
  });

});
