import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("admin WhatsApp group delivery log", () => {
  const originalGroup = process.env.ADMIN_WA_GROUP;

  beforeEach(() => {
    vi.resetModules();
    process.env.ADMIN_WA_GROUP = "12036341119221335@g.us";
  });

  afterEach(() => {
    vi.doUnmock("@workspace/db");
    vi.resetModules();
    if (originalGroup === undefined) {
      delete process.env.ADMIN_WA_GROUP;
    } else {
      process.env.ADMIN_WA_GROUP = originalGroup;
    }
  });

  it("mencatat status delivery group meskipun pengiriman di-skip pada test runtime", async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    const insert = vi.fn(() => ({ values }));

    vi.doMock("@workspace/db", () => ({
      db: {
        insert,
      },
    }));

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
});
