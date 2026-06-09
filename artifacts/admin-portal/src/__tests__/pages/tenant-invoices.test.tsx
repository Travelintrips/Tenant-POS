import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { renderWithProviders, withUser } from "@/test/render-utils";

const mockInvoices = [
  {
    id: 1,
    invoiceNumber: "INV-TENANT/202601/00001",
    tenantId: 1,
    tenantName: "Toko Maju",
    bookingId: 1,
    unitCode: "A01",
    rentAmount: "5000000",
    totalAmount: "5000000",
    paidAmount: "0",
    outstandingAmount: "5000000",
    status: "unpaid",
    dueDate: "2026-12-31",
    periodStart: "2026-01-01",
    periodEnd: "2026-01-31",
    createdAt: "2026-01-01T00:00:00Z",
  },
  {
    id: 2,
    invoiceNumber: "INV-TENANT/202601/00002",
    tenantId: 2,
    tenantName: "Butik Cantik",
    bookingId: 2,
    unitCode: "B02",
    rentAmount: "3000000",
    totalAmount: "3000000",
    paidAmount: "3000000",
    outstandingAmount: "0",
    status: "paid",
    dueDate: "2026-01-15",
    periodStart: "2026-01-01",
    periodEnd: "2026-01-31",
    createdAt: "2026-01-01T00:00:00Z",
  },
];

function setupMock(invoices = mockInvoices) {
  vi.mocked(global.fetch).mockImplementation((url: string) => {
    if (String(url).includes("/api/auth/me")) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(withUser()) } as Response);
    }
    if (String(url).includes("/api/tenant-invoices") || String(url).includes("/api/tenants")) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(invoices) } as Response);
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) } as Response);
  });
}

describe("Fase 3 — Halaman Invoice Tenant (Frontend)", () => {
  it("render halaman invoice tanpa crash", async () => {
    setupMock();
    const TenantInvoices = (await import("@/pages/tenant-invoices")).default;
    const { container } = renderWithProviders(<TenantInvoices />, { user: withUser() });
    expect(container).toBeTruthy();
  });

  it("menampilkan invoice dari API", async () => {
    setupMock();
    const TenantInvoices = (await import("@/pages/tenant-invoices")).default;
    renderWithProviders(<TenantInvoices />, { user: withUser() });

    await waitFor(() => {
      expect(screen.getByText("INV-TENANT/202601/00001")).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it("menampilkan invoice dengan status paid", async () => {
    setupMock();
    const TenantInvoices = (await import("@/pages/tenant-invoices")).default;
    renderWithProviders(<TenantInvoices />, { user: withUser() });

    await waitFor(() => {
      expect(screen.getByText("INV-TENANT/202601/00002")).toBeInTheDocument();
    }, { timeout: 5000 });
  });
});
