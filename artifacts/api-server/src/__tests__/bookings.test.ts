import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeAuthAgent } from "./helpers/agent";
import { createTestTenant, createTestBooking, cleanupAll, TEST_PREFIX } from "./helpers/factory";

let owner: any;
let finance: any;
let cashier: any;
let testTenant: any;

beforeAll(async () => {
  [owner, finance, cashier] = await Promise.all([
    makeAuthAgent("owner"),
    makeAuthAgent("finance"),
    makeAuthAgent("cashier"),
  ]);
  testTenant = await createTestTenant();
});

afterAll(cleanupAll);

function bookingPayload(overrides: Record<string, unknown> = {}) {
  const today = new Date();
  const future = new Date(today);
  future.setFullYear(today.getFullYear() + 1);
  return {
    tenantId: testTenant.id,
    unitCode: `BK-TEST-${Date.now()}`,
    startDate: today.toISOString().slice(0, 10),
    endDate: future.toISOString().slice(0, 10),
    rentAmount: "5000000",
    depositAmount: "0",
    serviceChargeAmount: "0",
    electricityChargeAmount: "0",
    waterChargeAmount: "0",
    totalAmount: "5000000",
    paidAmount: "0",
    remainingAmount: "5000000",
    billingCycle: "monthly",
    ...overrides,
  };
}

describe("Fase 2 — Kontrak Booking", () => {
  describe("GET /api/bookings", () => {
    it("mengembalikan array booking", async () => {
      const res = await owner.get("/api/bookings");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it("cashier tidak bisa akses (403)", async () => {
      const res = await cashier.get("/api/bookings");
      expect(res.status).toBe(403);
    });
  });

  describe("POST /api/bookings", () => {
    it("membuat booking baru dengan data valid", async () => {
      const res = await owner.post("/api/bookings").send(bookingPayload());
      expect(res.status).toBe(201);
      expect(res.body.id).toBeTypeOf("number");
      expect(res.body.tenantId).toBe(testTenant.id);
    });

    it("gagal jika rentAmount negatif (400)", async () => {
      const res = await owner.post("/api/bookings").send(
        bookingPayload({ rentAmount: "-100000" })
      );
      expect([400, 422]).toContain(res.status);
    });

    it("gagal jika endDate sebelum startDate (400)", async () => {
      const past = new Date();
      past.setFullYear(past.getFullYear() - 1);
      const res = await owner.post("/api/bookings").send(
        bookingPayload({ endDate: past.toISOString().slice(0, 10) })
      );
      expect([400, 422]).toContain(res.status);
    });

    it("finance juga bisa membuat booking", async () => {
      const res = await finance.post("/api/bookings").send(bookingPayload());
      expect(res.status).toBe(201);
    });
  });

  describe("GET /api/bookings/:id", () => {
    it("mengembalikan detail booking", async () => {
      const booking = await createTestBooking(testTenant.id);
      const res = await owner.get(`/api/bookings/${booking.id}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(booking.id);
    });

    it("404 jika booking tidak ditemukan", async () => {
      const res = await owner.get("/api/bookings/99999999");
      expect(res.status).toBe(404);
    });
  });

  describe("PUT /api/bookings/:id", () => {
    it("memperbarui data booking", async () => {
      const booking = await createTestBooking(testTenant.id);
      const today = new Date();
      const future = new Date(today);
      future.setFullYear(today.getFullYear() + 2);
      const res = await owner.put(`/api/bookings/${booking.id}`).send({
        ...bookingPayload(),
        endDate: future.toISOString().slice(0, 10),
        rentAmount: "6000000",
        totalAmount: "6000000",
      });
      expect(res.status).toBe(200);
    });
  });

  describe("POST /api/bookings/:id/terminate", () => {
    it("terminasi booking mengubah status menjadi terminated", async () => {
      const booking = await createTestBooking(testTenant.id);
      const res = await owner
        .post(`/api/bookings/${booking.id}/terminate`)
        .send({ reason: "Test terminasi" });
      expect(res.status).toBe(200);
      expect(res.body.booking.contractStatus).toBe("terminated");
    });

    it("finance tidak bisa terminasi booking (403)", async () => {
      const booking = await createTestBooking(testTenant.id);
      const res = await finance
        .post(`/api/bookings/${booking.id}/terminate`)
        .send({ reason: "Coba terminasi" });
      expect(res.status).toBe(403);
    });
  });
});
