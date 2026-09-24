import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync } from "node:crypto";

describe("google-sheets native REST client", () => {
  const originalEnv = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

  beforeEach(() => {
    vi.resetModules();
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({
      client_email: "tenant-sync@example.iam.gserviceaccount.com",
      private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      token_uri: "https://oauth2.googleapis.com/token",
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalEnv === undefined) delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    else process.env.GOOGLE_SERVICE_ACCOUNT_JSON = originalEnv;
  });

  it("membaca sheet memakai service-account JWT dan native fetch", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: "test-access-token",
        expires_in: 3600,
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        values: [
          ["Tanggal", "Kredit"],
          ["2026-09-24", "100000"],
        ],
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));

    vi.stubGlobal("fetch", fetchMock);

    const { readFromSheet } = await import("../services/google-sheets");
    const rows = await readFromSheet({
      spreadsheetId: "sheet-id",
      range: "A:Z",
    });

    expect(rows).toEqual([
      ["Tanggal", "Kredit"],
      ["2026-09-24", "100000"],
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const tokenCall = fetchMock.mock.calls[0];
    expect(tokenCall?.[0]).toBe("https://oauth2.googleapis.com/token");
    expect(tokenCall?.[1]?.method).toBe("POST");

    const sheetCall = fetchMock.mock.calls[1];
    expect(String(sheetCall?.[0])).toContain(
      "https://sheets.googleapis.com/v4/spreadsheets/sheet-id/values/A%3AZ",
    );
    expect((sheetCall?.[1]?.headers as Record<string, string>).authorization)
      .toBe("Bearer test-access-token");
  });

  it("menggunakan cache access token pada request berikutnya", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: "cached-token",
        expires_in: 3600,
      }), { status: 200 }))
      .mockImplementation(async () =>
        new Response(JSON.stringify({ values: [] }), { status: 200 }),
      );

    vi.stubGlobal("fetch", fetchMock);

    const { readFromSheet } = await import("../services/google-sheets");
    await readFromSheet({ spreadsheetId: "sheet-id", range: "A:Z" });
    await readFromSheet({ spreadsheetId: "sheet-id", range: "A:Z" });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.filter(([url]) =>
      String(url) === "https://oauth2.googleapis.com/token",
    )).toHaveLength(1);
  });
});
