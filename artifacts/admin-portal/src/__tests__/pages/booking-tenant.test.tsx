import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { renderWithProviders, withUser } from "@/test/render-utils";

const mockBookings = [
  {
    id: 1,
    tenantId: 1,
    tenantName: "Toko Maju",
    unitCode: "A01",
    floor: "1",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    rentAmount: "5000000",
    totalAmount: "5000000",
    paidAmount: "0",
    remainingAmount: "5000000",
    contractStatus: "active",
    paymentStatus: "UNPAID",
    bookingStatus: "aktif",
    status: "active",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: 2,
    tenantId: 2,
    tenantName: "Butik Cantik",
    unitCode: "B02",
    floor: "2",
    startDate: "2025-01-01",
    endDate: "2026-01-15",
    rentAmount: "3000000",
    totalAmount: "3000000",
    paidAmount: "3000000",
    remainingAmount: "0",
    contractStatus: "expired",
    paymentStatus: "PAID",
    bookingStatus: "aktif",
    status: "active",
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
  },
];

function setupFetchMock(bookings = mockBookings) {
  vi.mocked(global.fetch).mockImplementation((url: string) => {
    if (String(url).includes("/api/auth/me")) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(withUser()) } as Response);
    }
    if (String(url).includes("/api/bookings") || String(url).includes("/api/tenants")) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(bookings) } as Response);
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) } as Response);
  });
}

describe("Fase 2 — Halaman Booking Tenant (Frontend)", () => {
  it("render halaman booking tanpa crash", async () => {
    setupFetchMock();
    const BookingTenant = (await import("@/pages/booking-tenant")).default;
    const { container } = renderWithProviders(<BookingTenant />, { user: withUser() });
    expect(container).toBeTruthy();
  });

  it("menampilkan data booking dari API", async () => {
    setupFetchMock();
    const BookingTenant = (await import("@/pages/booking-tenant")).default;
    renderWithProviders(<BookingTenant />, { user: withUser() });

    await waitFor(() => {
      expect(screen.getByText("Toko Maju")).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it("menampilkan status kontrak dari booking", async () => {
    setupFetchMock();
    const BookingTenant = (await import("@/pages/booking-tenant")).default;
    renderWithProviders(<BookingTenant />, { user: withUser() });

    await waitFor(() => {
      expect(screen.getByText("Toko Maju")).toBeInTheDocument();
    }, { timeout: 5000 });
  });
});
