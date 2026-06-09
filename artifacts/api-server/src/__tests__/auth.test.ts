import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import app from "../app";
import { makeAuthAgent, unauthAgent } from "./helpers/agent";
import { cleanupAll } from "./helpers/factory";

afterAll(cleanupAll);

describe("Fase 1 — Auth & Role", () => {
  describe("dev-login", () => {
    it("berhasil login sebagai owner dan mengembalikan role yang benar", async () => {
      const agent = request.agent(app as any);
      const res = await agent.post("/api/auth/dev-login").send({
        email: `auth-owner-${process.pid}@mall-test.local`,
        name: "Test Owner",
        role: "owner",
      });
      expect(res.status).toBe(200);
      expect(res.body.role).toBe("owner");
    });

    it("berhasil login untuk semua 4 role yang valid", async () => {
      for (const role of ["owner", "admin", "finance", "cashier"] as const) {
        const agent = request.agent(app as any);
        const res = await agent.post("/api/auth/dev-login").send({
          email: `loop-${role}-${process.pid}@mall-test.local`,
          name: `Loop ${role}`,
          role,
        });
        expect(res.status).toBe(200);
        expect(res.body.role).toBe(role);
      }
    });

    it("role tidak valid default ke admin", async () => {
      const agent = request.agent(app as any);
      const res = await agent.post("/api/auth/dev-login").send({
        email: `invalid-role-${process.pid}@mall-test.local`,
        name: "Invalid",
        role: "superadmin",
      });
      expect(res.status).toBe(200);
      expect(res.body.role).toBe("admin");
    });
  });

  describe("endpoint yang membutuhkan autentikasi", () => {
    it("GET /api/tenants menolak request tanpa login (401)", async () => {
      const res = await unauthAgent().get("/api/tenants");
      expect(res.status).toBe(401);
    });

    it("GET /api/bookings menolak request tanpa login (401)", async () => {
      const res = await unauthAgent().get("/api/bookings");
      expect(res.status).toBe(401);
    });

    it("GET /api/laporan/kpi menolak request tanpa login (401)", async () => {
      const res = await unauthAgent().get("/api/laporan/kpi");
      expect(res.status).toBe(401);
    });

    it("GET /api/auth/me mengembalikan data user yang sedang login", async () => {
      const agent = await makeAuthAgent("owner");
      const res = await agent.get("/api/auth/me");
      expect(res.status).toBe(200);
      expect(res.body.role).toBe("owner");
    });
  });

  describe("pembatasan berdasarkan role", () => {
    it("cashier tidak bisa akses /api/tenants (403)", async () => {
      const agent = await makeAuthAgent("cashier");
      const res = await agent.get("/api/tenants");
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/ditolak/i);
    });

    it("cashier tidak bisa akses /api/bookings (403)", async () => {
      const agent = await makeAuthAgent("cashier");
      const res = await agent.get("/api/bookings");
      expect(res.status).toBe(403);
    });

    it("cashier tidak bisa akses laporan (403)", async () => {
      const agent = await makeAuthAgent("cashier");
      const res = await agent.get("/api/laporan/kpi");
      expect(res.status).toBe(403);
    });

    it("cashier bisa akses POS (200)", async () => {
      const agent = await makeAuthAgent("cashier");
      const res = await agent.get("/api/tenant-pos/overview");
      expect(res.status).toBe(200);
    });

    it("finance bisa akses laporan (200)", async () => {
      const agent = await makeAuthAgent("finance");
      const res = await agent.get("/api/laporan/kpi");
      expect(res.status).toBe(200);
    });

    it("finance tidak bisa akses /api/tenants (403)", async () => {
      const agent = await makeAuthAgent("finance");
      const res = await agent.get("/api/tenants");
      expect(res.status).toBe(403);
    });

    it("owner bisa akses semua endpoint utama", async () => {
      const agent = await makeAuthAgent("owner");
      const endpoints = [
        "/api/tenants",
        "/api/bookings",
        "/api/laporan/kpi",
        "/api/tenant-pos/overview",
        "/api/tenant-invoices",
        "/api/audit-logs",
      ];
      for (const ep of endpoints) {
        const res = await agent.get(ep);
        expect(res.status, `Endpoint ${ep} harus dapat diakses oleh owner`).not.toBe(401);
        expect(res.status, `Endpoint ${ep} harus dapat diakses oleh owner`).not.toBe(403);
      }
    });
  });

  describe("logout", () => {
    it("logout menghancurkan session sehingga request berikutnya 401", async () => {
      const agent = await makeAuthAgent("admin");
      await agent.post("/api/auth/logout").expect(200);
      const res = await agent.get("/api/tenants");
      expect(res.status).toBe(401);
    });
  });
});
