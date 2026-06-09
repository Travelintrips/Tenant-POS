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
    unitCode: `TU-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
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

  describe("PATCH /api/mall-units/:id", () => {
    it("update unit berhasil", async () => {
      const unit = await createTestUnit();
      const res = await owner.patch(`/api/mall-units/${unit.id}`).send({
        floor: "2",
      });
      expect(res.status).toBe(200);
      expect(res.body.floor).toBe("2");
    });

    it("update status unit berhasil", async () => {
      const unit = await createTestUnit();
      const res = await owner.patch(`/api/mall-units/${unit.id}`).send({
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
        const item = res.body[0];
        expect(item).toHaveProperty("tenantId");
        const hasStatus = "tenantStatus" in item || "bookingStatus" in item || "status" in item;
        expect(hasStatus).toBe(true);
      }
    });
  });

  describe("DELETE /api/mall-units/:id", () => {
    it("hapus unit berhasil", async () => {
      const unit = await createTestUnit({ unitCode: `DEL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` });
      const res = await owner.delete(`/api/mall-units/${unit.id}`);
      expect(res.status).toBe(200);
    });
  });
});
