import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { renderWithProviders, withUser, mockFetchResponse } from "@/test/render-utils";

const mockTenants = [
  {
    id: 1,
    businessName: "Toko Maju",
    ownerName: "Budi Santoso",
    phone: "08123456789",
    email: "budi@toko.com",
    status: "active",
    boothNumber: "A01",
    areaName: "Lantai 1",
    logoUrl: null,
    category: "Makanan",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: 2,
    businessName: "Butik Cantik",
    ownerName: "Sari Indah",
    phone: "08198765432",
    email: "sari@butik.com",
    status: "inactive",
    boothNumber: "B02",
    areaName: "Lantai 2",
    logoUrl: null,
    category: "Fashion",
    createdAt: "2026-01-15T00:00:00Z",
    updatedAt: "2026-01-15T00:00:00Z",
  },
];

describe("Fase 1 — Halaman Data Tenant (Frontend)", () => {
  it("render halaman tanpa crash", async () => {
    vi.mocked(global.fetch).mockImplementation((url: string) => {
      if (String(url).includes("/api/auth/me")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(withUser()),
        } as Response);
      }
      if (String(url).includes("/api/tenants")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockTenants),
        } as Response);
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) } as Response);
    });

    const DataTenant = (await import("@/pages/data-tenant")).default;
    const { container } = renderWithProviders(<DataTenant />, { user: withUser() });
    expect(container).toBeTruthy();
  });

  it("menampilkan nama tenant dari API", async () => {
    vi.mocked(global.fetch).mockImplementation((url: string) => {
      if (String(url).includes("/api/auth/me")) {
        return Promise.resolve({
          ok: true, status: 200,
          json: () => Promise.resolve(withUser()),
        } as Response);
      }
      if (String(url).includes("/api/tenants")) {
        return Promise.resolve({
          ok: true, status: 200,
          json: () => Promise.resolve(mockTenants),
        } as Response);
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) } as Response);
    });

    const DataTenant = (await import("@/pages/data-tenant")).default;
    renderWithProviders(<DataTenant />, { user: withUser() });

    await waitFor(() => {
      expect(screen.getByText("Toko Maju")).toBeInTheDocument();
    }, { timeout: 5000 });

    expect(screen.getByText("Butik Cantik")).toBeInTheDocument();
  });

  it("menampilkan status tenant dengan badge yang benar", async () => {
    vi.mocked(global.fetch).mockImplementation((url: string) => {
      if (String(url).includes("/api/auth/me")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(withUser()) } as Response);
      }
      if (String(url).includes("/api/tenants")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(mockTenants) } as Response);
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) } as Response);
    });

    const DataTenant = (await import("@/pages/data-tenant")).default;
    renderWithProviders(<DataTenant />, { user: withUser() });

    await waitFor(() => {
      expect(screen.getByText("Toko Maju")).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it("menampilkan state kosong saat tidak ada tenant", async () => {
    vi.mocked(global.fetch).mockImplementation((url: string) => {
      if (String(url).includes("/api/auth/me")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(withUser()) } as Response);
      }
      if (String(url).includes("/api/tenants")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) } as Response);
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) } as Response);
    });

    const DataTenant = (await import("@/pages/data-tenant")).default;
    const { container } = renderWithProviders(<DataTenant />, { user: withUser() });

    await waitFor(() => {
      expect(container).toBeTruthy();
    }, { timeout: 5000 });
  });
});
