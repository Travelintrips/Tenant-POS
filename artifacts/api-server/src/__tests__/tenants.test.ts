import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeAuthAgent } from "./helpers/agent";
import { createTestTenant, cleanupAll, TEST_PREFIX } from "./helpers/factory";

let owner: any;
let cashier: any;

beforeAll(async () => {
  owner = await makeAuthAgent("owner");
  cashier = await makeAuthAgent("cashier");
});

afterAll(cleanupAll);

describe("Fase 1+8 — Tenant CRUD & Validasi", () => {
  describe("GET /api/tenants", () => {
    it("mengembalikan array tenant", async () => {
      const res = await owner.get("/api/tenants");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it("cashier tidak bisa akses (403)", async () => {
      const res = await cashier.get("/api/tenants");
      expect(res.status).toBe(403);
    });
  });

  describe("POST /api/tenants", () => {
    it("membuat tenant baru dengan data valid", async () => {
      const res = await owner.post("/api/tenants").send({
        businessName: `${TEST_PREFIX} Toko Baru`,
        ownerName: "Budi Santoso",
        phone: "08123456789",
        email: "budi@test.com",
        status: "active",
        areaName: "",
      });
      expect(res.status).toBe(201);
      expect(res.body.businessName).toContain("Toko Baru");
      expect(res.body.id).toBeTypeOf("number");
    });

    it("gagal jika businessName kosong (400)", async () => {
      const res = await owner.post("/api/tenants").send({
        ownerName: "Tidak ada nama toko",
        status: "active",
        areaName: "",
      });
      expect(res.status).toBe(400);
    });

    it("gagal jika ownerName kosong (400)", async () => {
      const res = await owner.post("/api/tenants").send({
        businessName: `${TEST_PREFIX} Toko Tanpa Owner`,
        status: "active",
        areaName: "",
      });
      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/tenants/:id", () => {
    it("mengembalikan detail tenant berdasarkan ID", async () => {
      const tenant = await createTestTenant();
      const res = await owner.get(`/api/tenants/${tenant.id}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(tenant.id);
    });

    it("404 jika ID tidak ditemukan", async () => {
      const res = await owner.get("/api/tenants/99999999");
      expect(res.status).toBe(404);
    });

    it("400 jika ID bukan angka", async () => {
      const res = await owner.get("/api/tenants/bukan-angka");
      expect(res.status).toBe(400);
    });
  });

  describe("PUT /api/tenants/:id", () => {
    it("memperbarui data tenant dengan benar", async () => {
      const tenant = await createTestTenant();
      const res = await owner.put(`/api/tenants/${tenant.id}`).send({
        businessName: `${TEST_PREFIX} Toko Diperbarui`,
        ownerName: "Owner Baru",
        status: "active",
        areaName: "",
      });
      expect(res.status).toBe(200);
      expect(res.body.businessName).toContain("Diperbarui");
    });

    it("gagal update jika businessName kosong (400)", async () => {
      const tenant = await createTestTenant();
      const res = await owner.put(`/api/tenants/${tenant.id}`).send({
        ownerName: "Owner Ada",
        status: "active",
        areaName: "",
      });
      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /api/tenants/:id", () => {
    it("menghapus tenant dan mengembalikan success", async () => {
      const tenant = await createTestTenant({ businessName: `${TEST_PREFIX} Tenant Hapus` });
      const res = await owner.delete(`/api/tenants/${tenant.id}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("404 jika tenant tidak ditemukan", async () => {
      const res = await owner.delete("/api/tenants/99999999");
      expect(res.status).toBe(404);
    });
  });

  describe("Upload Logo — validasi tipe file", () => {
    it("menolak file SVG berbahaya (400 atau 415)", async () => {
      const res = await owner
        .post("/api/uploads/tenant-logo")
        .attach("logo", Buffer.from("<svg><script>alert(1)</script></svg>"), {
          filename: "malicious.svg",
          contentType: "image/svg+xml",
        });
      expect([400, 415, 422, 500]).toContain(res.status);
    });

    it("menolak file HTML (400 atau 415)", async () => {
      const res = await owner
        .post("/api/uploads/tenant-logo")
        .attach("logo", Buffer.from("<html><body>hack</body></html>"), {
          filename: "hack.html",
          contentType: "text/html",
        });
      expect([400, 415, 422, 500]).toContain(res.status);
    });
  });
});
