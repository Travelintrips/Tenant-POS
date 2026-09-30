import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getCstWaGatewayStatus,
  isCstWaGatewayConfigured,
  normalizeWhatsappDestination,
  sendGatewayText,
  verifyCstWaInboundEvent,
} from "../lib/whatsapp-gateway-client";

describe("CST WA Gateway client", () => {
  const original = {
    url: process.env.CST_WA_GATEWAY_URL,
    key: process.env.CST_WA_GATEWAY_API_KEY,
    device: process.env.CST_WA_DEVICE_ID,
    timeout: process.env.CST_WA_GATEWAY_TIMEOUT_MS,
  };

  beforeEach(() => {
    process.env.CST_WA_GATEWAY_URL = "https://wa.example.test";
    process.env.CST_WA_GATEWAY_API_KEY = "tenant-pos-test-key";
    process.env.CST_WA_DEVICE_ID = "tenant-pos-01";
    process.env.CST_WA_GATEWAY_TIMEOUT_MS = "1000";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (original.url === undefined) delete process.env.CST_WA_GATEWAY_URL;
    else process.env.CST_WA_GATEWAY_URL = original.url;
    if (original.key === undefined) delete process.env.CST_WA_GATEWAY_API_KEY;
    else process.env.CST_WA_GATEWAY_API_KEY = original.key;
    if (original.device === undefined) delete process.env.CST_WA_DEVICE_ID;
    else process.env.CST_WA_DEVICE_ID = original.device;
    if (original.timeout === undefined) delete process.env.CST_WA_GATEWAY_TIMEOUT_MS;
    else process.env.CST_WA_GATEWAY_TIMEOUT_MS = original.timeout;
  });

  it("normalizes Indonesian phone numbers and preserves group JID", () => {
    expect(normalizeWhatsappDestination("08123456789")).toBe("628123456789");
    expect(normalizeWhatsappDestination("+628123456789")).toBe("628123456789");
    expect(normalizeWhatsappDestination("12036341119221335@g.us")).toBe("12036341119221335@g.us");
  });

  it("sends text with client token, device id, and idempotency key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "queued", messageId: "msg-123" }), {
        status: 202,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendGatewayText("08123456789", "Halo", "invoice:123");

    expect(result).toMatchObject({ ok: true, queued: true, duplicate: false, messageId: "msg-123" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://wa.example.test/v1/messages");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer tenant-pos-test-key",
      "Content-Type": "application/json",
      "Idempotency-Key": "invoice:123",
    });
    expect(JSON.parse(String(init.body))).toEqual({
      deviceId: "tenant-pos-01",
      to: "628123456789",
      type: "text",
      text: "Halo",
    });
  });

  it("treats gateway duplicate response as accepted queued delivery", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ status: "duplicate", messageId: "msg-existing" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    await expect(sendGatewayText("628123456789", "Halo", "same-key")).resolves.toMatchObject({
      ok: true,
      queued: true,
      duplicate: true,
      messageId: "msg-existing",
    });
  });

  it("skips outbound safely when client API key is missing", async () => {
    delete process.env.CST_WA_GATEWAY_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(isCstWaGatewayConfigured()).toBe(false);
    await expect(sendGatewayText("628123456789", "Halo")).resolves.toMatchObject({
      ok: true,
      skipped: true,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("treats degraded gateway as connected while at least one worker is online", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          overallStatus: "degraded",
          onlineWorkers: 2,
          workers: [
            { workerId: "worker-01:02", deviceId: "02", status: "QR_REQUIRED" },
            { workerId: "worker-01:03", deviceId: "03", status: "ONLINE" },
          ],
          queue: { waiting: 3, active: 1, delayed: 2 },
        }),
        { status: 503, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await getCstWaGatewayStatus();
    expect(result).toMatchObject({
      configured: true,
      connected: true,
      provider: "CST WA Gateway",
      onlineWorkers: 2,
      queueCount: 6,
    });
    expect(result.message).toContain("degraded");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("verifies inbound event payload through the client-scoped gateway endpoint", async () => {
    const payload = {
      event: "message.received",
      deviceId: "tenant-pos-01",
      senderPhone: "628123456789",
      message: { key: { remoteJid: "628123456789@s.whatsapp.net" }, message: { conversation: "SETUJU 10" } },
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ deliveryId: "evt-1", payload }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifyCstWaInboundEvent("evt-1", payload)).resolves.toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://wa.example.test/v1/inbound-events/evt-1");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tenant-pos-test-key");
  });
});
