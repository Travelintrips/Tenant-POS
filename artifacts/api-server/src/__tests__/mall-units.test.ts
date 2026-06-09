import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeAuthAgent } from "./helpers/agent";
import { createTestUnit, cleanupAll } from "./helpers/factory";

let owner: any;
let cashier: any;

beforeAll(async () => {
  [owner, cashier] = await Promise.all([
    makeAuthAgent("owner"),
    makeAuthAgent("cashier"),
  ]);
});

afterAll(cleanupAll);

function unitPayload(overrides: Record<string, unknown> = {}) {
  return {
    unitCode: `TU-${Date.now()}`,
    floor: "1",
    zone: "A",
    sizeM2: "25",
    status: "available",
    ...overrides,
  };
}

describe("Fase 5 — Mall Units / Denah", () => {
  describe("GET /api/mall-units", () => {
    it("mengembalikan array unit mall", async () => {
      const res = await owner.get("/api/mall-units");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it("cashier bisa akses unit (200)", async () => {
      const res = await cashier.get("/api/mall-units");
      expect(res.status).toBe(200);
    });
  });

  describe("POST /api/mall-units", () => {
    it("membuat unit baru dengan data valid", async () => {
      const payload = unitPayload();
      const res = await owner.post("/api/mall-units").send(payload);
      expect(res.status).toBe(201);
      expect(res.body.unitCode).toBe(payload.unitCode);
      expect(res.body.status).toBe("available");
    });

    it("gagal jika unitCode sudah ada (duplikat)", async () => {
      const payload = unitPayload({ unitCode: `DUP-${Date.now()}` });
      await owner.post("/api/mall-units").send(payload);
      const res = await owner.post("/api/mall-units").send(payload);
      expect([409, 400, 422, 500]).toContain(res.status);
    });
  });

  describe("PUT /api/mall-units/:id", () => {
    it("update unit berhasil", async () => {
      const unit = await createTestUnit();
      const res = await owner.put(`/api/mall-units/${unit.id}`).send({
        unitCode: unit.unitCode,
        floor: "2",
        zone: "B",
        status: "available",
      });
      expect(res.status).toBe(200);
      expect(res.body.floor).toBe("2");
    });

    it("update status unit berhasil", async () => {
      const unit = await createTestUnit();
      const res = await owner.put(`/api/mall-units/${unit.id}`).send({
        unitCode: unit.unitCode,
        floor: unit.floor ?? "1",
        status: "maintenance",
      });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("maintenance");
    });
  });

  describe("GET /api/tenant-pos/floor-plan", () => {
    it("floor-plan mengembalikan unit dengan status", async () => {
      const res = await owner.get("/api/tenant-pos/floor-plan");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      if (res.body.length > 0) {
        expect(res.body[0]).toHaveProperty("status");
        expect(res.body[0]).toHaveProperty("unitCode");
      }
    });
  });

  describe("DELETE /api/mall-units/:id", () => {
    it("hapus unit berhasil", async () => {
      const unit = await createTestUnit({ unitCode: `DEL-${Date.now()}` });
      const res = await owner.delete(`/api/mall-units/${unit.id}`);
      expect(res.status).toBe(200);
    });
  });
});
