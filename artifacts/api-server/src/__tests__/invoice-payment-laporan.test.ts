import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { createTestApp } from "./helpers/app";
import { createTenant, createBooking, cleanupTestData } from "./helpers/factory";
import { db } from "@workspace/db";
import { tenantInvoicesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const app = createTestApp("owner");

let tenantIds: number[] = [];

beforeEach(() => {
  tenantIds = [];
});

afterEach(async () => {
  await cleanupTestData(tenantIds);
});

// ─── POST /api/tenant-invoices ────────────────────────────────────────────────

describe("POST /api/tenant-invoices", () => {
  it("membuat invoice baru dengan data lengkap → 201", async () => {
    const tenant = await createTenant();
    tenantIds.push(tenant.id);

    const res = await request(app)
      .post("/api/tenant-invoices")
      .send({
        tenantId: tenant.id,
        unitCode: "A-01",
        periodStart: "2026-06-01",
        periodEnd: "2026-06-30",
        dueDate: "2026-07-05",
        rentAmount: 5000000,
        serviceChargeAmount: 500000,
        electricityChargeAmount: 300000,
        waterChargeAmount: 100000,
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      tenantId: tenant.id,
      unitCode: "A-01",
      status: expect.stringMatching(/^(unpaid|overdue)$/),
    });
    expect(res.body.invoiceNumber).toBeTruthy();
    expect(res.body.invoiceNumber).toMatch(/^INV-TENANT\/\d{6}\/\d{5}$/);
    expect(Number(res.body.totalAmount)).toBeGreaterThan(0);
    expect(Number(res.body.outstandingAmount)).toBe(Number(res.body.totalAmount));
    expect(Number(res.body.paidAmount)).toBe(0);
  });

  it("menolak jika tenantId tidak ada → 400", async () => {
    const res = await request(app)
      .post("/api/tenant-invoices")
      .send({
        unitCode: "A-01",
        rentAmount: 5000000,
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });
});

// ─── POST /api/tenant-invoices/generate-from-booking/:bookingId ───────────────

describe("POST /api/tenant-invoices/generate-from-booking/:bookingId", () => {
  it("membuat invoice dari booking aktif → 201 dengan field lengkap", async () => {
    const tenant = await createTenant();
    tenantIds.push(tenant.id);
    const booking = await createBooking(tenant.id, {
      billingCycle: "monthly",
      rentAmount: "5000000",
      serviceChargeAmount: "500000",
      electricityChargeAmount: "300000",
      waterChargeAmount: "100000",
      unitCode: "B-05",
    });

    const res = await request(app)
      .post(`/api/tenant-invoices/generate-from-booking/${booking.id}`)
      .send({});

    expect(res.status).toBe(201);

    const body = res.body;
    expect(body.invoiceNumber).toBeTruthy();
    expect(body.invoiceNumber).toMatch(/^INV-TENANT\/\d{6}\/\d{5}$/);
    expect(body.bookingId).toBe(booking.id);
    expect(body.tenantId).toBe(tenant.id);
    expect(body.unitCode).toBe("B-05");
    expect(body.periodStart).toBeTruthy();
    expect(body.periodEnd).toBeTruthy();
    expect(body.dueDate).toBeTruthy();
    expect(Number(body.rentAmount)).toBe(5000000);
    expect(Number(body.serviceChargeAmount)).toBe(500000);
    expect(Number(body.electricityChargeAmount)).toBe(300000);
    expect(Number(body.waterChargeAmount)).toBe(100000);
    expect(Number(body.subtotal)).toBeGreaterThan(0);
    expect(Number(body.totalAmount)).toBeGreaterThan(0);
    expect(Number(body.paidAmount)).toBe(0);
    expect(Number(body.outstandingAmount)).toBe(Number(body.totalAmount));
    expect(body.status).toMatch(/^(unpaid|overdue)$/);
  });

  it("billing cycle quarterly → periodStart dan periodEnd mencakup kuartal", async () => {
    const tenant = await createTenant();
    tenantIds.push(tenant.id);
    const booking = await createBooking(tenant.id, {
      billingCycle: "quarterly",
      rentAmount: "10000000",
    });

    const res = await request(app)
      .post(`/api/tenant-invoices/generate-from-booking/${booking.id}`)
      .send({});

    expect(res.status).toBe(201);
    expect(res.body.periodStart).toBeTruthy();
    expect(res.body.periodEnd).toBeTruthy();

    const start = new Date(res.body.periodStart);
    const end = new Date(res.body.periodEnd);
    const diffMs = end.getTime() - start.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThanOrEqual(85);
  });

  it("bookingId tidak ditemukan → 404 dengan pesan jelas", async () => {
    const res = await request(app)
      .post("/api/tenant-invoices/generate-from-booking/9999999")
      .send({});

    expect(res.status).toBe(404);
    expect(res.body.error).toBeTruthy();
    expect(typeof res.body.error).toBe("string");
  });

  it("bookingId bukan angka → 400", async () => {
    const res = await request(app)
      .post("/api/tenant-invoices/generate-from-booking/abc")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it("invoice kedua untuk booking+periode yang sama → 409 atau kembalikan invoice existing", async () => {
    const tenant = await createTenant();
    tenantIds.push(tenant.id);
    const booking = await createBooking(tenant.id, { billingCycle: "monthly" });

    const first = await request(app)
      .post(`/api/tenant-invoices/generate-from-booking/${booking.id}`)
      .send({});
    expect(first.status).toBe(201);

    const second = await request(app)
      .post(`/api/tenant-invoices/generate-from-booking/${booking.id}`)
      .send({});

    expect([200, 201, 409]).toContain(second.status);

    if (second.status === 409) {
      expect(second.body.error).toBeTruthy();
    } else {
      expect(second.body.invoiceNumber).toBe(first.body.invoiceNumber);
    }
  });

  it("generate dua invoice dari booking berbeda → dua invoice number unik", async () => {
    const tenant = await createTenant();
    tenantIds.push(tenant.id);
    const bookingA = await createBooking(tenant.id, { unitCode: "A-01", billingCycle: "monthly" });
    const bookingB = await createBooking(tenant.id, { unitCode: "A-02", billingCycle: "monthly" });

    const resA = await request(app)
      .post(`/api/tenant-invoices/generate-from-booking/${bookingA.id}`)
      .send({});

    const resB = await request(app)
      .post(`/api/tenant-invoices/generate-from-booking/${bookingB.id}`)
      .send({});

    expect(resA.status).toBe(201);
    expect(resB.status).toBe(201);
    expect(resA.body.invoiceNumber).not.toBe(resB.body.invoiceNumber);
  });
});

// ─── POST /api/tenant-invoices/:id/payment ────────────────────────────────────

describe("POST /api/tenant-invoices/:id/payment", () => {
  it("pembayaran penuh → status invoice menjadi paid", async () => {
    const tenant = await createTenant();
    tenantIds.push(tenant.id);
    const booking = await createBooking(tenant.id);

    const genRes = await request(app)
      .post(`/api/tenant-invoices/generate-from-booking/${booking.id}`)
      .send({});
    expect(genRes.status).toBe(201);

    const invoiceId = genRes.body.id;
    const total = Number(genRes.body.totalAmount);

    const payRes = await request(app)
      .post(`/api/tenant-invoices/${invoiceId}/payment`)
      .send({
        amountPaid: total,
        paymentMethod: "transfer",
      });

    expect(payRes.status).toBe(201);
    expect(payRes.body.success).toBe(true);
    expect(payRes.body.invoiceStatus).toBe("paid");
    expect(payRes.body.receiptNumber).toBeTruthy();
    expect(Number(payRes.body.outstandingAmount)).toBe(0);
    expect(Number(payRes.body.paidAmount)).toBe(total);
  });

  it("pembayaran sebagian → status invoice menjadi partial", async () => {
    const tenant = await createTenant();
    tenantIds.push(tenant.id);
    const booking = await createBooking(tenant.id);

    const genRes = await request(app)
      .post(`/api/tenant-invoices/generate-from-booking/${booking.id}`)
      .send({});
    expect(genRes.status).toBe(201);

    const invoiceId = genRes.body.id;
    const total = Number(genRes.body.totalAmount);
    const partial = Math.floor(total / 2);

    const payRes = await request(app)
      .post(`/api/tenant-invoices/${invoiceId}/payment`)
      .send({
        amountPaid: partial,
        paymentMethod: "tunai",
      });

    expect(payRes.status).toBe(201);
    expect(payRes.body.invoiceStatus).toBe("partial");
    expect(Number(payRes.body.outstandingAmount)).toBe(total - partial);
  });

  it("invoice tidak ditemukan → 404", async () => {
    const res = await request(app)
      .post("/api/tenant-invoices/9999999/payment")
      .send({ amountPaid: 100000, paymentMethod: "tunai" });

    expect(res.status).toBe(404);
    expect(res.body.error).toBeTruthy();
  });

  it("amountPaid nol atau negatif → 400", async () => {
    const tenant = await createTenant();
    tenantIds.push(tenant.id);
    const booking = await createBooking(tenant.id);
    const genRes = await request(app)
      .post(`/api/tenant-invoices/generate-from-booking/${booking.id}`)
      .send({});
    expect(genRes.status).toBe(201);

    const res = await request(app)
      .post(`/api/tenant-invoices/${genRes.body.id}/payment`)
      .send({ amountPaid: 0, paymentMethod: "tunai" });

    expect(res.status).toBe(400);
  });

  it("invoice sudah paid → 409", async () => {
    const tenant = await createTenant();
    tenantIds.push(tenant.id);
    const booking = await createBooking(tenant.id);
    const genRes = await request(app)
      .post(`/api/tenant-invoices/generate-from-booking/${booking.id}`)
      .send({});
    const invoiceId = genRes.body.id;
    const total = Number(genRes.body.totalAmount);

    await request(app)
      .post(`/api/tenant-invoices/${invoiceId}/payment`)
      .send({ amountPaid: total, paymentMethod: "tunai" });

    const res = await request(app)
      .post(`/api/tenant-invoices/${invoiceId}/payment`)
      .send({ amountPaid: 1000, paymentMethod: "tunai" });

    expect(res.status).toBe(409);
  });
});

// ─── POST /api/tenant-invoices/:id/cancel ─────────────────────────────────────

describe("POST /api/tenant-invoices/:id/cancel", () => {
  it("membatalkan invoice unpaid → status cancelled", async () => {
    const tenant = await createTenant();
    tenantIds.push(tenant.id);
    const booking = await createBooking(tenant.id);
    const genRes = await request(app)
      .post(`/api/tenant-invoices/generate-from-booking/${booking.id}`)
      .send({});
    expect(genRes.status).toBe(201);

    const res = await request(app)
      .post(`/api/tenant-invoices/${genRes.body.id}/cancel`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("cancelled");
  });
});

// ─── GET /api/tenant-invoices ─────────────────────────────────────────────────

describe("GET /api/tenant-invoices", () => {
  it("mengembalikan array invoice", async () => {
    const res = await request(app).get("/api/tenant-invoices");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("filter by status", async () => {
    const tenant = await createTenant();
    tenantIds.push(tenant.id);
    const booking = await createBooking(tenant.id);
    await request(app)
      .post(`/api/tenant-invoices/generate-from-booking/${booking.id}`)
      .send({});

    const res = await request(app).get("/api/tenant-invoices?status=unpaid");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ─── GET /api/laporan/kpi ─────────────────────────────────────────────────────

describe("GET /api/laporan/kpi", () => {
  it("mengembalikan KPI fields yang diharapkan", async () => {
    const res = await request(app).get("/api/laporan/kpi");
    expect(res.status).toBe(200);
    expect(typeof res.body.revenueThisMonth).toBe("number");
    expect(typeof res.body.paidThisMonth).toBe("number");
    expect(typeof res.body.totalOutstanding).toBe("number");
    expect(typeof res.body.totalOverdue).toBe("number");
    expect(typeof res.body.collectionRate).toBe("number");
    expect(res.body.collectionRate).toBeGreaterThanOrEqual(0);
    expect(res.body.collectionRate).toBeLessThanOrEqual(100);
  });
});

// ─── GET /api/laporan/summary ─────────────────────────────────────────────────

describe("GET /api/laporan/summary", () => {
  it("mengembalikan summary 12 bulan untuk tahun yang diminta", async () => {
    const res = await request(app).get("/api/laporan/summary?tahun=2026");
    expect(res.status).toBe(200);
    expect(res.body.tahun).toBe(2026);
    expect(Array.isArray(res.body.monthly)).toBe(true);
    expect(res.body.monthly).toHaveLength(12);
    expect(res.body.monthly[0]).toMatchObject({
      bulan: expect.any(String),
      bulanNum: 1,
      totalAmount: expect.any(Number),
    });
    expect(typeof res.body.totalPendapatan).toBe("number");
    expect(res.body.tunggakan).toBeTruthy();
  });

  it("tahun tidak valid → 400", async () => {
    const res = await request(app).get("/api/laporan/summary?tahun=bukan");
    expect(res.status).toBe(400);
  });
});

// ─── GET /api/laporan/aging ───────────────────────────────────────────────────

describe("GET /api/laporan/aging", () => {
  it("mengembalikan buckets aging receivable", async () => {
    const res = await request(app).get("/api/laporan/aging");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.buckets)).toBe(true);
    expect(res.body.buckets).toHaveLength(5);
    for (const bucket of res.body.buckets) {
      expect(typeof bucket.label).toBe("string");
      expect(typeof bucket.amount).toBe("number");
      expect(typeof bucket.count).toBe("number");
    }
  });
});

// ─── GET /api/laporan/payment-methods ────────────────────────────────────────

describe("GET /api/laporan/payment-methods", () => {
  it("mengembalikan rekap per metode pembayaran", async () => {
    const res = await request(app).get("/api/laporan/payment-methods");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    const tunai = res.body.data.find((d: any) => d.method === "tunai");
    expect(tunai).toBeTruthy();
    expect(typeof tunai.totalAmount).toBe("number");
  });
});
