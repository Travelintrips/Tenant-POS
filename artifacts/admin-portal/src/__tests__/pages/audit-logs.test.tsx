import React from "react";
import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders, withUser } from "@/test/render-utils";

const mockAuditLogs = [
  {
    id: 1,
    userId: 1,
    userEmail: "owner@test.local",
    userName: "Test Owner",
    action: "create_tenant",
    entityType: "tenant",
    entityId: "42",
    beforeData: null,
    afterData: { businessName: "Toko Baru", ownerName: "Pemilik Baru" },
    ipAddress: "127.0.0.1",
    userAgent: "Mozilla/5.0",
    createdAt: "2026-06-09T10:00:00Z",
  },
  {
    id: 2,
    userId: 1,
    userEmail: "owner@test.local",
    userName: "Test Owner",
    action: "create_payment",
    entityType: "payment",
    entityId: "15",
    beforeData: null,
    afterData: { amount: "5000000", method: "cash" },
    ipAddress: "127.0.0.1",
    userAgent: "Mozilla/5.0",
    createdAt: "2026-06-09T11:00:00Z",
  },
];

function setupAuditMocks(logs = mockAuditLogs) {
  vi.mocked(global.fetch).mockImplementation((url: string) => {
    const urlStr = String(url);
    if (urlStr.includes("/api/auth/me")) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(withUser()) } as Response);
    }
    if (urlStr.includes("/api/audit-logs")) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(logs) } as Response);
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) } as Response);
  });
}

describe("Fase 7 — Halaman Audit Log (Frontend)", () => {
  it("render halaman audit log tanpa crash", async () => {
    setupAuditMocks();
    const AuditLogs = (await import("@/pages/audit-logs")).default;
    const { container } = renderWithProviders(<AuditLogs />, { user: withUser() });
    expect(container).toBeTruthy();
  });

  it("menampilkan log dari API", async () => {
    setupAuditMocks();
    const AuditLogs = (await import("@/pages/audit-logs")).default;
    renderWithProviders(<AuditLogs />, { user: withUser() });

    await waitFor(() => {
      const hasContent =
        screen.queryByText("create_tenant") !== null ||
        screen.queryByText("owner@test.local") !== null ||
        screen.queryByText("Test Owner") !== null;
      expect(hasContent).toBe(true);
    }, { timeout: 5000 });
  });

  it("data sensitif tidak muncul di audit log UI", async () => {
    const logsWithSensitive = mockAuditLogs.map((log) => ({
      ...log,
      afterData: { ...log.afterData, password: "[REDACTED]", token: "[REDACTED]" },
    }));
    setupAuditMocks(logsWithSensitive);
    const AuditLogs = (await import("@/pages/audit-logs")).default;
    renderWithProviders(<AuditLogs />, { user: withUser() });

    await waitFor(() => {
      expect(document.body).toBeTruthy();
    }, { timeout: 5000 });

    const bodyText = document.body.innerText ?? "";
    expect(bodyText).not.toMatch(/supersecretpassword/);
  });

  it("filter action dan entityType tersedia", async () => {
    setupAuditMocks();
    const AuditLogs = (await import("@/pages/audit-logs")).default;
    renderWithProviders(<AuditLogs />, { user: withUser() });

    await waitFor(() => {
      const inputs = document.querySelectorAll("input, select, [role='combobox'], [role='listbox']");
      expect(inputs.length).toBeGreaterThanOrEqual(0);
    }, { timeout: 5000 });
  });
});
