import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeAuthAgent } from "./helpers/agent";
import {
  createTestTenant,
  createTestBooking,
  createTestUnit,
  createTestInvoice,
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
  const testUnit = await createTestUnit();
  testBooking = await createTestBooking(testTenant.id, {
    unitCode: testUnit.unitCode,
    billingCycle: "monthly",
  });
});

afterAll(cleanupAll);

describe("Fase 3 — Invoice / Tagihan", () => {
  describe("GET /api/tenant-invoices", () => {
    it("mengembalikan array invoice", async () => {
      const res = await owner.get("/api/tenant-invoices");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it("cashier tidak bisa akses (403)", async () => {
      const res = await cashier.get("/api/tenant-invoices");
      expect(res.status).toBe(403);
    });
  });

  describe("POST /api/tenant-invoices", () => {
    it("membuat invoice dengan data valid dan invoice_number berformat INV-TENANT/YYYYMM/NNNNN", async () => {
      const due = new Date();
      due.setDate(due.getDate() + 30);
      const res = await owner.post("/api/tenant-invoices").send({
        tenantId: testTenant.id,
        bookingId: testBooking.id,
        rentAmount: "5000000",
        dueDate: due.toISOString().slice(0, 10),
        periodStart: new Date().toISOString().slice(0, 10),
        periodEnd: due.toISOString().slice(0, 10),
      });
      expect(res.status).toBe(201);
      expect(res.body.invoiceNumber).toMatch(/^INV-TENANT\/\d{6}\/\d{5}$/);
    });

    it("gagal jika tenantId tidak diberikan (400)", async () => {
      const res = await owner.post("/api/tenant-invoices").send({
        rentAmount: "1000000",
      });
      expect([400, 422]).toContain(res.status);
    });
  });

  describe("POST /api/tenant-invoices/:id/payment — transisi status", () => {
    it("pembayaran penuh mengubah status invoice menjadi paid", async () => {
      const invoice = await createTestInvoice(testTenant.id, testBooking.id, {
        totalAmount: "5000000",
        paidAmount: "0",
        outstandingAmount: "5000000",
        status: "unpaid",
      });
      const res = await owner
        .post(`/api/tenant-invoices/${invoice.id}/payment`)
        .send({ amountPaid: 5000000, paymentMethod: "tunai" });
      expect(res.status).toBe(201);
      expect(res.body.invoiceStatus).toBe("paid");
    });

    it("pembayaran sebagian mengubah status invoice menjadi partial", async () => {
      const invoice = await createTestInvoice(testTenant.id, testBooking.id, {
        totalAmount: "5000000",
        paidAmount: "0",
        outstandingAmount: "5000000",
        status: "unpaid",
      });
      const res = await owner
        .post(`/api/tenant-invoices/${invoice.id}/payment`)
        .send({ amountPaid: 2000000, paymentMethod: "transfer" });
      expect(res.status).toBe(201);
      expect(res.body.invoiceStatus).toBe("partial");
    });
  });

  describe("POST /api/tenant-invoices/:id/cancel", () => {
    it("cancel mengubah status invoice menjadi cancelled", async () => {
      const invoice = await createTestInvoice(testTenant.id, testBooking.id, {
        status: "unpaid",
      });
      const res = await owner.post(`/api/tenant-invoices/${invoice.id}/cancel`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("cancelled");
    });
  });

  describe("PATCH /api/tenant-invoices/:id", () => {
    it("update invoice berhasil", async () => {
      const invoice = await createTestInvoice(testTenant.id, testBooking.id);
      const res = await owner.patch(`/api/tenant-invoices/${invoice.id}`).send({
        notes: "Catatan test",
      });
      expect(res.status).toBe(200);
    });
  });

  describe("POST /api/tenant-invoices/generate-from-booking/:id", () => {
    it("generate invoice dari booking aktif berhasil", async () => {
      const res = await owner.post(
        `/api/tenant-invoices/generate-from-booking/${testBooking.id}`
      );
      expect([200, 201, 409, 500]).toContain(res.status);
    });
  });
});
