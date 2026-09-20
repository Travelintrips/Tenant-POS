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
import {
  tenantBookingsTable,
  tenantInvoicesTable,
  tenantPaymentsTable,
  bankMutationsTable,
  bankReconciliationMatchesTable,
} from "@workspace/db/schema";
import { eq, inArray } from "drizzle-orm";

let owner: any;
let cashier: any;
let finance: any;
let testTenant: any;
let testBooking: any;
let testInvoice: any;
let testShift: any;
const reconciliationMutationIds: number[] = [];

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

afterAll(async () => {
  if (reconciliationMutationIds.length > 0) {
    await db.delete(bankReconciliationMatchesTable)
      .where(inArray(bankReconciliationMatchesTable.mutationId, reconciliationMutationIds));
    await db.delete(bankMutationsTable)
      .where(inArray(bankMutationsTable.id, reconciliationMutationIds));
  }
  await cleanupAll();
});

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

    it("menyimpan ID pembayaran asli secara terstruktur untuk pembayaran duplikat", async () => {
      const originalRes = await owner.post("/api/tenant-pos/payments").send({
        tenantId: testTenant.id,
        bookingId: testBooking.id,
        amountPaid: 120000,
        paymentMethod: "transfer",
        shiftId: testShift.id,
      });
      expect(originalRes.status).toBe(201);
      const originalPaymentId = originalRes.body.payment.id;
      track("payments", originalPaymentId);

      const duplicateRes = await owner.post("/api/tenant-pos/payments").send({
        tenantId: testTenant.id,
        bookingId: testBooking.id,
        amountPaid: 120000,
        paymentMethod: "transfer",
        shiftId: testShift.id,
      });
      expect(duplicateRes.status).toBe(201);
      const duplicatePaymentId = duplicateRes.body.payment.id;
      track("payments", duplicatePaymentId);

      const voidRes = await owner
        .post(`/api/tenant-pos/payments/${duplicatePaymentId}/void`)
        .send({
          voidReason: "Transaksi terdeteksi ganda",
          duplicateOfPaymentId: originalPaymentId,
        });
      expect(voidRes.status).toBe(200);
      expect(voidRes.body.duplicateOfPaymentId).toBe(originalPaymentId);

      const historyRes = await owner.get("/api/tenant-pos/payments-history?status=voided&pageSize=100");
      expect(historyRes.status).toBe(200);
      expect(
        historyRes.body.data.find((payment: { id: number }) => payment.id === duplicatePaymentId)
          ?.duplicateOfPaymentId,
      ).toBe(originalPaymentId);

      const detailRes = await owner.get(`/api/payments/${duplicatePaymentId}`);
      expect(detailRes.status).toBe(200);
      expect(detailRes.body.duplicateOfPaymentId).toBe(originalPaymentId);

      const [storedPayment] = await db
        .select({ duplicateOfPaymentId: tenantPaymentsTable.duplicateOfPaymentId })
        .from(tenantPaymentsTable)
        .where(eq(tenantPaymentsTable.id, duplicatePaymentId));
      expect(storedPayment?.duplicateOfPaymentId).toBe(originalPaymentId);
    });

    it("menandai payment sebagai Rekon untuk match canonical BizPortal tenant_invoice", async () => {
      const [payment] = await db.insert(tenantPaymentsTable).values({
        tenantId: testTenant.id,
        bookingId: testBooking.id,
        invoiceId: testInvoice.id,
        amount: "333001",
        method: "transfer",
        paymentMethod: "transfer",
        status: "PAID",
        paymentStatus: "PAID",
        approvalStatus: "approved",
        paidAt: new Date("2026-09-20T01:00:00Z"),
        paymentNumber: `TEST-REKON-${Date.now()}`,
      }).returning({ id: tenantPaymentsTable.id });
      track("payments", payment.id);

      const [mutation] = await db.insert(bankMutationsTable).values({
        transactionDate: "2026-09-20",
        description: "test tenant canonical reconciliation",
        amount: "333001",
        creditAmount: "333001",
        debitAmount: "0",
        direction: "IN",
        mutationKey: `test-rekon-${Date.now()}`,
        status: "posted",
      }).returning({ id: bankMutationsTable.id });
      reconciliationMutationIds.push(mutation.id);

      await db.insert(bankReconciliationMatchesTable).values({
        mutationId: mutation.id,
        candidateType: "tenant_invoice",
        candidateId: payment.id,
        matchScore: 100,
        status: "posted",
      });

      const historyRes = await owner.get("/api/tenant-pos/payments-history?pageSize=100");
      expect(historyRes.status).toBe(200);
      const row = historyRes.body.data.find((item: { id: number }) => item.id === payment.id);
      expect(row?.reconciled).toBe(true);
      expect(row?.bankMatchedByRule).toBe(false);
    });

    it("menandai kasus historis Rule AI sebagai Cocok Bank, bukan Rekon canonical", async () => {
      const [payment] = await db.insert(tenantPaymentsTable).values({
        tenantId: testTenant.id,
        bookingId: testBooking.id,
        invoiceId: testInvoice.id,
        amount: "333002",
        method: "transfer",
        paymentMethod: "transfer",
        status: "PAID",
        paymentStatus: "PAID",
        approvalStatus: "approved",
        paidAt: new Date("2026-09-20T02:00:00Z"),
        paymentNumber: `TEST-RULE-MATCH-${Date.now()}`,
      }).returning({ id: tenantPaymentsTable.id });
      track("payments", payment.id);

      const [mutation] = await db.insert(bankMutationsTable).values({
        transactionDate: "2026-09-20",
        description: "test historical rule reconciliation",
        amount: "333002",
        creditAmount: "333002",
        debitAmount: "0",
        direction: "IN",
        mutationKey: `test-rule-match-${Date.now()}`,
        status: "posted",
      }).returning({ id: bankMutationsTable.id });
      reconciliationMutationIds.push(mutation.id);

      await db.insert(bankReconciliationMatchesTable).values([
        {
          mutationId: mutation.id,
          candidateType: "tenant_invoice",
          candidateId: payment.id,
          matchScore: 93,
          status: "superseded",
        },
        {
          mutationId: mutation.id,
          candidateType: "recon_rule",
          candidateId: 63,
          matchScore: 100,
          status: "approved",
        },
      ]);

      const historyRes = await owner.get("/api/tenant-pos/payments-history?pageSize=100");
      expect(historyRes.status).toBe(200);
      const row = historyRes.body.data.find((item: { id: number }) => item.id === payment.id);
      expect(row?.reconciled).toBe(false);
      expect(row?.bankMatchedByRule).toBe(true);
    });

    it("menolak duplicateOfPaymentId lintas-tenant tanpa mengubah payment yang di-void", async () => {
      const originalTenant = await createTestTenant();
      const originalBooking = await createTestBooking(originalTenant.id);
      const duplicateTenant = await createTestTenant();
      const duplicateBooking = await createTestBooking(duplicateTenant.id);

      const originalRes = await owner.post("/api/tenant-pos/payments").send({
        tenantId: originalTenant.id,
        bookingId: originalBooking.id,
        amountPaid: 110000,
        paymentMethod: "transfer",
        shiftId: testShift.id,
      });
      expect(originalRes.status).toBe(201);
      const originalPaymentId = originalRes.body.payment.id;
      track("payments", originalPaymentId);

      const duplicateRes = await owner.post("/api/tenant-pos/payments").send({
        tenantId: duplicateTenant.id,
        bookingId: duplicateBooking.id,
        amountPaid: 110000,
        paymentMethod: "transfer",
        shiftId: testShift.id,
      });
      expect(duplicateRes.status).toBe(201);
      const duplicatePaymentId = duplicateRes.body.payment.id;
      track("payments", duplicatePaymentId);

      const [paymentBeforeVoid] = await db
        .select()
        .from(tenantPaymentsTable)
        .where(eq(tenantPaymentsTable.id, duplicatePaymentId));
      expect(paymentBeforeVoid).toBeTruthy();
      expect(paymentBeforeVoid?.tenantId).toBe(duplicateTenant.id);
      expect(paymentBeforeVoid?.isVoided).toBe(false);

      const voidRes = await owner
        .post(`/api/tenant-pos/payments/${duplicatePaymentId}/void`)
        .send({
          voidReason: "Pembayaran asli berasal dari tenant lain",
          duplicateOfPaymentId: originalPaymentId,
        });
      expect(voidRes.status).toBe(400);

      const [paymentAfterRejectedVoid] = await db
        .select()
        .from(tenantPaymentsTable)
        .where(eq(tenantPaymentsTable.id, duplicatePaymentId));
      expect(paymentAfterRejectedVoid).toEqual(paymentBeforeVoid);
    });

    it("menolak void lintas-tenant tanpa mengubah saldo atau status booking", async () => {
      const originalTenant = await createTestTenant();
      const originalBooking = await createTestBooking(originalTenant.id);
      const targetTenant = await createTestTenant();
      const targetBooking = await createTestBooking(targetTenant.id);

      const originalRes = await owner.post("/api/tenant-pos/payments").send({
        tenantId: originalTenant.id,
        bookingId: originalBooking.id,
        amountPaid: 110000,
        paymentMethod: "transfer",
        shiftId: testShift.id,
      });
      expect(originalRes.status).toBe(201);
      const originalPaymentId = originalRes.body.payment.id;
      track("payments", originalPaymentId);

      const targetRes = await owner.post("/api/tenant-pos/payments").send({
        tenantId: targetTenant.id,
        bookingId: targetBooking.id,
        amountPaid: 275000,
        paymentMethod: "transfer",
        shiftId: testShift.id,
      });
      expect(targetRes.status).toBe(201);
      const targetPaymentId = targetRes.body.payment.id;
      track("payments", targetPaymentId);

      const [bookingBeforeVoid] = await db
        .select({
          paidAmount: tenantBookingsTable.paidAmount,
          remainingAmount: tenantBookingsTable.remainingAmount,
          paymentStatus: tenantBookingsTable.paymentStatus,
        })
        .from(tenantBookingsTable)
        .where(eq(tenantBookingsTable.id, targetBooking.id));
      expect(bookingBeforeVoid).toEqual({
        paidAmount: "275000",
        remainingAmount: "4725000",
        paymentStatus: "PARTIAL",
      });

      const voidRes = await owner
        .post(`/api/tenant-pos/payments/${targetPaymentId}/void`)
        .send({
          voidReason: "Pembayaran asli berasal dari tenant lain",
          duplicateOfPaymentId: originalPaymentId,
        });
      expect(voidRes.status).toBe(400);

      const [bookingAfterRejectedVoid] = await db
        .select({
          paidAmount: tenantBookingsTable.paidAmount,
          remainingAmount: tenantBookingsTable.remainingAmount,
          paymentStatus: tenantBookingsTable.paymentStatus,
        })
        .from(tenantBookingsTable)
        .where(eq(tenantBookingsTable.id, targetBooking.id));
      expect(bookingAfterRejectedVoid).toEqual(bookingBeforeVoid);
    });

    it("menolak void lintas-tenant tanpa mengubah saldo atau status invoice", async () => {
      const originalTenant = await createTestTenant();
      const originalBooking = await createTestBooking(originalTenant.id);
      const targetTenant = await createTestTenant();
      const targetInvoice = await createTestInvoice(targetTenant.id, undefined, {
        totalAmount: "2400000",
        paidAmount: "0",
        outstandingAmount: "2400000",
        status: "unpaid",
      });

      const originalRes = await owner.post("/api/tenant-pos/payments").send({
        tenantId: originalTenant.id,
        bookingId: originalBooking.id,
        amountPaid: 110000,
        paymentMethod: "transfer",
        shiftId: testShift.id,
      });
      expect(originalRes.status).toBe(201);
      const originalPaymentId = originalRes.body.payment.id;
      track("payments", originalPaymentId);

      const targetRes = await owner.post("/api/tenant-pos/payments").send({
        tenantId: targetTenant.id,
        invoiceId: targetInvoice.id,
        amountPaid: 325000,
        paymentMethod: "transfer",
        shiftId: testShift.id,
      });
      expect(targetRes.status).toBe(201);
      const targetPaymentId = targetRes.body.payment.id;
      track("payments", targetPaymentId);

      const [invoiceBeforeVoid] = await db
        .select({
          paidAmount: tenantInvoicesTable.paidAmount,
          outstandingAmount: tenantInvoicesTable.outstandingAmount,
          status: tenantInvoicesTable.status,
        })
        .from(tenantInvoicesTable)
        .where(eq(tenantInvoicesTable.id, targetInvoice.id));
      expect(invoiceBeforeVoid).toEqual({
        paidAmount: "325000",
        outstandingAmount: "2075000",
        status: "partial",
      });

      const voidRes = await owner
        .post(`/api/tenant-pos/payments/${targetPaymentId}/void`)
        .send({
          voidReason: "Pembayaran asli berasal dari tenant lain",
          duplicateOfPaymentId: originalPaymentId,
        });
      expect(voidRes.status).toBe(400);

      const [invoiceAfterRejectedVoid] = await db
        .select({
          paidAmount: tenantInvoicesTable.paidAmount,
          outstandingAmount: tenantInvoicesTable.outstandingAmount,
          status: tenantInvoicesTable.status,
        })
        .from(tenantInvoicesTable)
        .where(eq(tenantInvoicesTable.id, targetInvoice.id));
      expect(invoiceAfterRejectedVoid).toEqual(invoiceBeforeVoid);
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
