import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithProviders, withUser } from "@/test/render-utils";
import { SiteProvider, useSite } from "@/contexts/site-context";

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

const sites = [
  { id: 1, code: "TOD_M1_BANDARA", name: "TOD M1", type: "mall_tenant", status: "active" },
  { id: 2, code: "SPORT_CENTER_BANDARA", name: "Sport Center", type: "sport_center", status: "active" },
];

function setupMock(invoices = mockInvoices) {
  vi.mocked(global.fetch).mockImplementation((url: string) => {
    if (String(url).includes("/api/auth/me")) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(withUser()) } as Response);
    }
    if (String(url).includes("/api/sites")) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(sites) } as Response);
    }
    if (String(url).includes("/api/tenant-invoices") || String(url).includes("/api/tenants")) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(invoices) } as Response);
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) } as Response);
  });
}

function renderInvoicePage(Page: React.ComponentType) {
  return renderWithProviders(
    <SiteProvider>
      <Page />
    </SiteProvider>,
    { user: withUser() },
  );
}

function TestSiteSwitcher() {
  const { sites: availableSites, setActiveSite } = useSite();
  return (
    <div>
      {availableSites.map((site) => (
        <button key={site.id} type="button" onClick={() => setActiveSite(site)}>
          switch-{site.id}
        </button>
      ))}
    </div>
  );
}

describe("Fase 3 — Halaman Invoice Tenant (Frontend)", () => {
  it("render halaman invoice tanpa crash", async () => {
    setupMock();
    const TenantInvoices = (await import("@/pages/tenant-invoices")).default;
    const { container } = renderInvoicePage(TenantInvoices);
    expect(container).toBeTruthy();
  });

  it("menampilkan invoice dari API", async () => {
    setupMock();
    const TenantInvoices = (await import("@/pages/tenant-invoices")).default;
    renderInvoicePage(TenantInvoices);

    await waitFor(() => {
      expect(screen.getByText("INV-TENANT/202601/00001")).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it("langsung menghilangkan data site lama ketika site diganti", async () => {
    localStorage.setItem("mall_active_site_id", "2");

    let resolveTod: ((value: Response) => void) | undefined;
    const todResponse = new Promise<Response>((resolve) => {
      resolveTod = resolve;
    });

    vi.mocked(global.fetch).mockImplementation((url: string, options?: RequestInit) => {
      const requestUrl = String(url);
      if (requestUrl.includes("/api/auth/me")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(withUser()) } as Response);
      }
      if (requestUrl.includes("/api/sites")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(sites) } as Response);
      }
      if (requestUrl.includes("/api/tenant-invoices")) {
        const headers = (options?.headers ?? {}) as Record<string, string>;
        const siteId = headers["x-site-id"];
        if (siteId === "1") return todResponse;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve([{ ...mockInvoices[0], id: 22, invoiceNumber: "SPORT-OLD-001" }]),
        } as Response);
      }
      if (requestUrl.includes("/api/tenants")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) } as Response);
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) } as Response);
    });

    const TenantInvoices = (await import("@/pages/tenant-invoices")).default;
    renderWithProviders(
      <SiteProvider>
        <TestSiteSwitcher />
        <TenantInvoices />
      </SiteProvider>,
      { user: withUser() },
    );

    await waitFor(() => {
      expect(screen.getByText("SPORT-OLD-001")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "switch-1" }));

    await waitFor(() => {
      expect(screen.queryByText("SPORT-OLD-001")).not.toBeInTheDocument();
    });

    resolveTod?.({
      ok: true,
      status: 200,
      json: () => Promise.resolve([{ ...mockInvoices[1], id: 11, invoiceNumber: "TOD-NEW-001" }]),
    } as Response);

    await waitFor(() => {
      expect(screen.getByText("TOD-NEW-001")).toBeInTheDocument();
    });
  });

  it("menampilkan invoice dengan status paid", async () => {
    setupMock();
    const TenantInvoices = (await import("@/pages/tenant-invoices")).default;
    renderInvoicePage(TenantInvoices);

    await waitFor(() => {
      expect(screen.getByText("INV-TENANT/202601/00002")).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it("Total Tunggakan mengecualikan invoice future tetapi tetap menghitung tunggakan lama", async () => {
    const invoices = [
      {
        ...mockInvoices[0],
        id: 101,
        invoiceNumber: "INV-CURRENT-001",
        periodStart: "2020-09-01",
        periodEnd: "2020-09-30",
        status: "unpaid",
        outstandingAmount: "5000000",
      },
      {
        ...mockInvoices[0],
        id: 102,
        invoiceNumber: "INV-OLD-001",
        periodStart: "2020-08-01",
        periodEnd: "2020-08-31",
        status: "overdue",
        outstandingAmount: "3000000",
      },
      {
        ...mockInvoices[0],
        id: 103,
        invoiceNumber: "INV-FUTURE-001",
        periodStart: "2099-10-01",
        periodEnd: "2099-10-31",
        status: "unpaid",
        outstandingAmount: "7000000",
      },
    ];

    setupMock(invoices);
    const TenantInvoices = (await import("@/pages/tenant-invoices")).default;
    renderInvoicePage(TenantInvoices);

    expect(await screen.findByText("Rp 8.000.000")).toBeInTheDocument();
    expect(screen.queryByText("Rp 15.000.000")).not.toBeInTheDocument();
  });

});
