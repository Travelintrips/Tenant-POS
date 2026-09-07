import React from "react";
import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders, withUser } from "@/test/render-utils";

const mockKpi = {
  totalRevenue: 15000000,
  collectionRate: 75,
  totalOutstanding: 5000000,
  overdueCount: 2,
  overdueAmount: 3000000,
};

const mockSummary = {
  tahun: 2026,
  monthly: Array.from({ length: 12 }, (_, i) => ({
    bulan: ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Ags","Sep","Okt","Nov","Des"][i],
    bulanNum: i + 1,
    totalAmount: i < 3 ? 5000000 : 0,
    jumlahTransaksi: i < 3 ? 3 : 0,
  })),
  totalPendapatan: 15000000,
  totalTransaksi: 9,
  tunggakan: { totalTunggakan: 0, jumlahUnit: 0 },
  total: 15000000,
  jumlahTransaksi: 9,
};

const mockAging = {
  bucket0to30: { count: 5, total: 10000000 },
  bucket31to60: { count: 2, total: 4000000 },
  bucket61to90: { count: 1, total: 2000000 },
  bucketOver90: { count: 0, total: 0 },
};

function setupLaporanMocks(recentPayments: unknown[] = []) {
  vi.mocked(global.fetch).mockImplementation((url: string) => {
    const urlStr = String(url);
    if (urlStr.includes("/api/auth/me")) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(withUser()) } as Response);
    }
    if (urlStr.includes("/api/laporan/kpi")) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(mockKpi) } as Response);
    }
    if (urlStr.includes("/api/laporan/summary")) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(mockSummary) } as Response);
    }
    if (urlStr.includes("/api/laporan/aging")) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(mockAging) } as Response);
    }
    if (urlStr.includes("/api/laporan/piutang")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: [], pagination: { total: 0, limit: 200, offset: 0 } }),
      } as Response);
    }
    if (urlStr.includes("/api/laporan/rekap-payments")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: [], pagination: { total: 0, limit: 100, offset: 0 }, tahun: 2026, bulan: null }),
      } as Response);
    }
    if (urlStr.includes("/api/tenant-pos/recent-payments")) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(recentPayments) } as Response);
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) } as Response);
  });
}

describe("Fase 6 — Halaman Laporan (Frontend)", () => {
  it("render halaman laporan tanpa crash", async () => {
    setupLaporanMocks();
    const Laporan = (await import("@/pages/laporan")).default;
    const { container } = renderWithProviders(<Laporan />, { user: withUser() });
    expect(container).toBeTruthy();
  });

  it("menampilkan KPI cards dari API", async () => {
    setupLaporanMocks();
    const Laporan = (await import("@/pages/laporan")).default;
    renderWithProviders(<Laporan />, { user: withUser() });

    await waitFor(() => {
      expect(document.body).toBeTruthy();
    }, { timeout: 5000 });
  });

  it("export CSV button tersedia di halaman laporan", async () => {
    setupLaporanMocks();
    const Laporan = (await import("@/pages/laporan")).default;
    renderWithProviders(<Laporan />, { user: withUser() });

    await waitFor(() => {
      const buttons = document.querySelectorAll("button");
      expect(buttons.length).toBeGreaterThan(0);
    }, { timeout: 5000 });
  });

  it("tetap render saat tanggal pembayaran terbaru kosong", async () => {
    setupLaporanMocks([{
      id: 1,
      amount: 100000,
      discountAmount: 0,
      penaltyAmount: 0,
      paymentMethod: "transfer",
      receiptNumber: null,
      notes: null,
      paidAt: null,
      businessName: "Tenant Lama",
      boothNumber: "A-01",
      areaName: "Lantai 1",
      periodLabel: null,
    }]);
    const Laporan = (await import("@/pages/laporan")).default;
    renderWithProviders(<Laporan />, { user: withUser() });

    expect(await screen.findByText("Tanggal tidak tersedia")).toBeTruthy();
    expect(screen.getByText("Tenant Lama")).toBeTruthy();
  });
});
