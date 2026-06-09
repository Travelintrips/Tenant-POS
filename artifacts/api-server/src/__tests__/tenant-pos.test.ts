import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeAuthAgent } from "./helpers/agent";
import {
  createTestTenant,
  createTestBooking,
  createTestInvoice,
  createTestShift,
  cleanupAll,
  track,
} from "./helpers/factory";
import { db } from "@workspace/db";
import { tenantPaymentsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

let owner: any;
let cashier: any;
let finance: any;
let testTenant: any;
let testBooking: any;
let testInvoice: any;
let testShift: any;

beforeAll(async () => {
  [owner, cashier, finance] = await Promise.all([
    makeAuthAgent("owner"),
    makeAuthAgent("cashier"),
    makeAuthAgent("finance"),
  ]);
  testTenant = await createTestTenant();
  testBooking = await createTestBooking(testTenant.id);
  testInvoice = await createTestInvoice(testTenant.id, testBooking.id, {
    totalAmount: "3000000",
    paidAmount: "0",
    outstandingAmount: "3000000",
    status: "unpaid",
  });
  testShift = await createTestShift();
});

afterAll(cleanupAll);

describe("Fase 4 — POS Pembayaran", () => {
  describe("GET /api/tenant-pos/overview", () => {
    it("mengembalikan statistik overview dengan field yang tepat", async () => {
      const res = await owner.get("/api/tenant-pos/overview");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("totalActiveTenants");
      expect(res.body).toHaveProperty("unpaidCount");
      expect(res.body).toHaveProperty("paidTodayAmount");
    });

    it("cashier bisa akses overview (200)", async () => {
      const res = await cashier.get("/api/tenant-pos/overview");
      expect(res.status).toBe(200);
    });
  });

  describe("GET /api/tenant-pos/floor-plan", () => {
    it("mengembalikan data floor plan", async () => {
      const res = await owner.get("/api/tenant-pos/floor-plan");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe("POST /api/tenant-pos/payments", () => {
    it("cashier bisa membuat payment cash", async () => {
      const res = await cashier.post("/api/tenant-pos/payments").send({
        tenantId: testTenant.id,
        bookingId: testBooking.id,
        invoiceId: testInvoice.id,
        amountPaid: 1000000,
        paymentMethod: "tunai",
        shiftId: testShift.id,
      });
      expect(res.status).toBe(201);
      expect(res.body.payment).toBeTruthy();
      expect(res.body.payment.paymentMethod).toBe("tunai");
      track("payments", res.body.payment.id);
    });

    it("payment via QRIS berhasil", async () => {
      const newInvoice = await createTestInvoice(testTenant.id, testBooking.id, {
        totalAmount: "2000000",
        paidAmount: "0",
        outstandingAmount: "2000000",
        status: "unpaid",
      });
      const res = await cashier.post("/api/tenant-pos/payments").send({
        tenantId: testTenant.id,
        bookingId: testBooking.id,
        invoiceId: newInvoice.id,
        amountPaid: 2000000,
        paymentMethod: "qris",
        shiftId: testShift.id,
      });
      expect(res.status).toBe(201);
      expect(res.body.payment.paymentMethod).toBe("qris");
      track("payments", res.body.payment.id);
    });

    it("payment via transfer berhasil", async () => {
      const res = await owner.post("/api/tenant-pos/payments").send({
        tenantId: testTenant.id,
        bookingId: testBooking.id,
        amountPaid: 500000,
        paymentMethod: "transfer",
        shiftId: testShift.id,
      });
      expect(res.status).toBe(201);
      track("payments", res.body.payment.id);
    });
  });

  describe("POST /api/tenant-pos/payments/:id/void", () => {
    it("void payment membutuhkan alasan (400 jika alasan kosong)", async () => {
      const payRes = await owner.post("/api/tenant-pos/payments").send({
        tenantId: testTenant.id,
        bookingId: testBooking.id,
        amountPaid: 100000,
        paymentMethod: "tunai",
        shiftId: testShift.id,
      });
      expect(payRes.status).toBe(201);
      const paymentId = payRes.body.payment.id;
      track("payments", paymentId);

      const voidRes = await owner.post(`/api/tenant-pos/payments/${paymentId}/void`).send({});
      expect([400, 422]).toContain(voidRes.status);
    });

    it("void payment dengan alasan valid — payment ditandai isVoided=true", async () => {
      const payRes = await owner.post("/api/tenant-pos/payments").send({
        tenantId: testTenant.id,
        bookingId: testBooking.id,
        amountPaid: 200000,
        paymentMethod: "tunai",
        shiftId: testShift.id,
      });
      expect(payRes.status).toBe(201);
      const paymentId = payRes.body.payment.id;
      track("payments", paymentId);

      const voidRes = await owner
        .post(`/api/tenant-pos/payments/${paymentId}/void`)
        .send({ voidReason: "Test void pembayaran" });
      expect(voidRes.status).toBe(200);
      expect(voidRes.body.isVoided).toBe(true);
    });

    it("cashier tidak bisa void payment (403)", async () => {
      const payRes = await owner.post("/api/tenant-pos/payments").send({
        tenantId: testTenant.id,
        bookingId: testBooking.id,
        amountPaid: 150000,
        paymentMethod: "tunai",
        shiftId: testShift.id,
      });
      if (payRes.status === 201) {
        track("payments", payRes.body.payment.id);
        const voidRes = await cashier
          .post(`/api/tenant-pos/payments/${payRes.body.payment.id}/void`)
          .send({ reason: "Coba void" });
        expect(voidRes.status).toBe(403);
      }
    });
  });

  describe("GET /api/tenant-pos/recent-payments", () => {
    it("mengembalikan list pembayaran terbaru", async () => {
      const res = await owner.get("/api/tenant-pos/recent-payments");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });
});
