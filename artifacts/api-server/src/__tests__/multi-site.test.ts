import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@workspace/db";
import { mallSitesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { makeAuthAgent } from "./helpers/agent";
import { createTestTenant, createTestBooking, cleanupAll, TEST_PREFIX } from "./helpers/factory";

let owner: ReturnType<typeof makeAuthAgent> extends Promise<infer T> ? T : never;
let todSiteId: number;
let sportSiteId: number;

beforeAll(async () => {
  owner = await makeAuthAgent("owner");

  const [tod] = await db
    .select()
    .from(mallSitesTable)
    .where(eq(mallSitesTable.code, "TOD_M1_BANDARA"));
  const [sport] = await db
    .select()
    .from(mallSitesTable)
    .where(eq(mallSitesTable.code, "SPORT_CENTER_BANDARA"));

  if (!tod || !sport) {
    throw new Error(
      "Sites tidak ditemukan. Pastikan seed sudah dijalankan (TOD_M1_BANDARA & SPORT_CENTER_BANDARA).",
    );
  }

  todSiteId = tod.id;
  sportSiteId = sport.id;
});

afterAll(cleanupAll);

describe("Multi-Site — Isolasi Data per Lokasi", () => {
  describe("GET /api/tenants — isolasi tenant per site", () => {
    it("tenant site TOD tidak muncul di request site Sport Center", async () => {
      const todTenant = await createTestTenant({
        businessName: `${TEST_PREFIX} Toko TOD`,
        siteId: todSiteId,
      });
      const sportTenant = await createTestTenant({
        businessName: `${TEST_PREFIX} Toko Sport`,
        siteId: sportSiteId,
      });

      const res = await owner
        .get("/api/tenants")
        .set("x-site-id", String(sportSiteId));

      expect(res.status).toBe(200);
      const ids = res.body.map((t: any) => t.id);
      expect(ids).toContain(sportTenant.id);
      expect(ids).not.toContain(todTenant.id);
    });

    it("tenant site Sport Center tidak muncul di request site TOD", async () => {
      const sportTenant = await createTestTenant({
        businessName: `${TEST_PREFIX} Toko Sport 2`,
        siteId: sportSiteId,
      });
      const todTenant = await createTestTenant({
        businessName: `${TEST_PREFIX} Toko TOD 2`,
        siteId: todSiteId,
      });

      const res = await owner
        .get("/api/tenants")
        .set("x-site-id", String(todSiteId));

      expect(res.status).toBe(200);
      const ids = res.body.map((t: any) => t.id);
      expect(ids).toContain(todTenant.id);
      expect(ids).not.toContain(sportTenant.id);
    });
  });

  describe("POST /api/tenants — inject siteId dari header", () => {
    it("tenant baru mendapat siteId sesuai header x-site-id", async () => {
      const res = await owner
        .post("/api/tenants")
        .set("x-site-id", String(sportSiteId))
        .send({
          businessName: `${TEST_PREFIX} Toko Inject Sport`,
          ownerName: "Pemilik Test",
          status: "active",
          areaName: "",
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeTypeOf("number");
      expect(res.body.siteId).toBe(sportSiteId);

      if (res.body.id) {
        const { tenantsTable } = await import("@workspace/db/schema");
        await db.delete(tenantsTable).where(eq(tenantsTable.id, res.body.id));
      }
    });
  });

  describe("GET /api/bookings — isolasi booking per site", () => {
    it("booking site TOD tidak muncul di request site Sport Center", async () => {
      const todTenant = await createTestTenant({
        businessName: `${TEST_PREFIX} Toko Booking TOD`,
        siteId: todSiteId,
      });
      const sportTenant = await createTestTenant({
        businessName: `${TEST_PREFIX} Toko Booking Sport`,
        siteId: sportSiteId,
      });

      const todBooking = await createTestBooking(todTenant.id, { siteId: todSiteId });
      const sportBooking = await createTestBooking(sportTenant.id, { siteId: sportSiteId });

      const res = await owner
        .get("/api/bookings")
        .set("x-site-id", String(sportSiteId));

      expect(res.status).toBe(200);
      const ids = res.body.map((b: any) => b.id);
      expect(ids).toContain(sportBooking.id);
      expect(ids).not.toContain(todBooking.id);
    });
  });

  describe("GET /api/tenant-invoices — isolasi invoice per site", () => {
    it("invoice site A tidak muncul di request site B", async () => {
      const todTenant = await createTestTenant({
        businessName: `${TEST_PREFIX} Tenant Inv TOD`,
        siteId: todSiteId,
      });
      const sportTenant = await createTestTenant({
        businessName: `${TEST_PREFIX} Tenant Inv Sport`,
        siteId: sportSiteId,
      });

      // Buat invoice langsung via API agar siteId terinjeksi
      const todRes = await owner
        .post("/api/tenant-invoices")
        .set("x-site-id", String(todSiteId))
        .send({
          tenantId: todTenant.id,
          rentAmount: 1000000,
          totalAmount: 1000000,
        });
      expect(todRes.status).toBe(201);

      const sportRes = await owner
        .post("/api/tenant-invoices")
        .set("x-site-id", String(sportSiteId))
        .send({
          tenantId: sportTenant.id,
          rentAmount: 1000000,
          totalAmount: 1000000,
        });
      expect(sportRes.status).toBe(201);

      // Ambil invoice untuk site Sport Center
      const listRes = await owner
        .get("/api/tenant-invoices")
        .set("x-site-id", String(sportSiteId));

      expect(listRes.status).toBe(200);
      const ids = listRes.body.map((i: any) => i.id);
      expect(ids).toContain(sportRes.body.id);
      expect(ids).not.toContain(todRes.body.id);
    });
  });

  describe("GET /api/sites — list site yang tersedia", () => {
    it("mengembalikan minimal 2 site (TOD dan Sport Center)", async () => {
      const res = await owner.get("/api/sites");
      expect(res.status).toBe(200);
      const codes = (res.body.sites ?? res.body).map((s: any) => s.code);
      expect(codes).toContain("TOD_M1_BANDARA");
      expect(codes).toContain("SPORT_CENTER_BANDARA");
    });
  });

  describe("GET /api/laporan/kpi — KPI per site", () => {
    it("mengembalikan data tanpa error untuk site TOD", async () => {
      const res = await owner
        .get("/api/laporan/kpi")
        .set("x-site-id", String(todSiteId));
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("revenueThisMonth");
      expect(res.body).toHaveProperty("collectionRate");
    });

    it("mengembalikan data tanpa error untuk site Sport Center", async () => {
      const res = await owner
        .get("/api/laporan/kpi")
        .set("x-site-id", String(sportSiteId));
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("revenueThisMonth");
    });
  });

  describe("GET /api/laporan/summary — ringkasan per site", () => {
    it("mengembalikan data ringkasan tanpa error", async () => {
      const res = await owner
        .get("/api/laporan/summary")
        .set("x-site-id", String(todSiteId));
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("monthly");
      expect(Array.isArray(res.body.monthly)).toBe(true);
    });
  });

  describe("GET /api/tenant-pos/overview — overview per site", () => {
    it("mengembalikan data overview tanpa error untuk site TOD", async () => {
      const res = await owner
        .get("/api/tenant-pos/overview")
        .set("x-site-id", String(todSiteId));
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("totalActiveTenants");
    });

    it("mengembalikan data overview tanpa error untuk site Sport Center", async () => {
      const res = await owner
        .get("/api/tenant-pos/overview")
        .set("x-site-id", String(sportSiteId));
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("totalActiveTenants");
    });
  });

  describe("GET /api/mall-units — isolasi unit per site", () => {
    it("mengembalikan unit milik site aktif (tidak ada error)", async () => {
      const res = await owner
        .get("/api/mall-units")
        .set("x-site-id", String(todSiteId));
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });
});
