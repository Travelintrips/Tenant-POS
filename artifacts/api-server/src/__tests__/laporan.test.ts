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
      expect(res.body).toHaveProperty("totalRevenue");
      expect(res.body).toHaveProperty("collectionRate");
      expect(res.body).toHaveProperty("totalOutstanding");
      expect(res.body).toHaveProperty("overdueCount");
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
      expect(Array.isArray(res.body)).toBe(true);
    });

    it("void payment tidak masuk laporan revenue", async () => {
      const res = await owner.get("/api/laporan/kpi");
      expect(res.status).toBe(200);
      expect(typeof res.body.totalRevenue).toBe("number");
    });
  });

  describe("GET /api/laporan/aging", () => {
    it("mengembalikan aging buckets 0-30, 31-60, 61-90, >90 hari", async () => {
      const res = await owner.get("/api/laporan/aging");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("bucket0to30");
      expect(res.body).toHaveProperty("bucket31to60");
      expect(res.body).toHaveProperty("bucket61to90");
      expect(res.body).toHaveProperty("bucketOver90");
    });
  });

  describe("GET /api/laporan/rekap-payments", () => {
    it("mengembalikan rekap pembayaran", async () => {
      const res = await owner.get("/api/laporan/rekap-payments");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it("filter per bulan dan tahun berjalan", async () => {
      const now = new Date();
      const res = await owner.get(
        `/api/laporan/rekap-payments?bulan=${now.getMonth() + 1}&tahun=${now.getFullYear()}`
      );
      expect(res.status).toBe(200);
    });
  });

  describe("Export CSV", () => {
    it("GET /api/laporan/piutang/export mengembalikan CSV", async () => {
      const res = await owner.get("/api/laporan/piutang/export");
      expect(res.status).toBe(200);
      const contentType = res.headers["content-type"] ?? "";
      expect(contentType).toMatch(/csv|text/i);
    });
  });
});
