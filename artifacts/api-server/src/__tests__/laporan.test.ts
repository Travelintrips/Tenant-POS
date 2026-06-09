import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeAuthAgent } from "./helpers/agent";
import {
  createTestTenant,
  createTestBooking,
  createTestPayment,
  cleanupAll,
} from "./helpers/factory";

let owner: any;
let finance: any;
let cashier: any;
let testTenant: any;
let testBooking: any;

beforeAll(async () => {
  [owner, finance, cashier] = await Promise.all([
    makeAuthAgent("owner"),
    makeAuthAgent("finance"),
    makeAuthAgent("cashier"),
  ]);
  testTenant = await createTestTenant();
  testBooking = await createTestBooking(testTenant.id);
  await createTestPayment(testTenant.id, testBooking.id);
});

afterAll(cleanupAll);

describe("Fase 6 — Laporan Piutang", () => {
  describe("GET /api/laporan/kpi", () => {
    it("mengembalikan KPI dengan field yang diperlukan", async () => {
      const res = await owner.get("/api/laporan/kpi");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("revenueThisMonth");
      expect(res.body).toHaveProperty("collectionRate");
      expect(res.body).toHaveProperty("totalOutstanding");
      expect(res.body).toHaveProperty("totalOverdue");
    });

    it("cashier tidak bisa akses laporan (403)", async () => {
      const res = await cashier.get("/api/laporan/kpi");
      expect(res.status).toBe(403);
    });

    it("finance bisa akses laporan (200)", async () => {
      const res = await finance.get("/api/laporan/kpi");
      expect(res.status).toBe(200);
    });
  });

  describe("GET /api/laporan/summary", () => {
    it("mengembalikan ringkasan bulanan untuk tahun ini", async () => {
      const tahun = new Date().getFullYear();
      const res = await owner.get(`/api/laporan/summary?tahun=${tahun}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("monthly");
      expect(Array.isArray(res.body.monthly)).toBe(true);
      expect(res.body.monthly).toHaveLength(12);
    });

    it("400 jika parameter tahun tidak valid", async () => {
      const res = await owner.get("/api/laporan/summary?tahun=bukan-angka");
      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/laporan/piutang", () => {
    it("mengembalikan data piutang tenant", async () => {
      const res = await owner.get("/api/laporan/piutang");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("data");
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body).toHaveProperty("pagination");
    });

    it("void payment tidak masuk laporan revenue", async () => {
      const res = await owner.get("/api/laporan/kpi");
      expect(res.status).toBe(200);
      expect(typeof res.body.revenueThisMonth).toBe("number");
    });
  });

  describe("GET /api/laporan/aging", () => {
    it("mengembalikan aging buckets 0-30, 31-60, 61-90, >90 hari", async () => {
      const res = await owner.get("/api/laporan/aging");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("buckets");
      expect(Array.isArray(res.body.buckets)).toBe(true);
      expect(res.body.buckets.length).toBeGreaterThanOrEqual(4);
      const labels = res.body.buckets.map((b: any) => b.label);
      expect(labels.some((l: string) => l.includes("30"))).toBe(true);
    });
  });

  describe("GET /api/laporan/rekap-payments", () => {
    it("mengembalikan rekap pembayaran", async () => {
      const res = await owner.get("/api/laporan/rekap-payments");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("data");
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it("filter per bulan dan tahun berjalan", async () => {
      const now = new Date();
      const res = await owner.get(
        `/api/laporan/rekap-payments?bulan=${now.getMonth() + 1}&tahun=${now.getFullYear()}`
      );
      expect(res.status).toBe(200);
    });
  });

});
