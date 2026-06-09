import { db } from "@workspace/db";
import {
  tenantsTable,
  tenantBookingsTable,
  tenantInvoicesTable,
  tenantPaymentsTable,
  mallUnitsTable,
  cashierShiftsTable,
} from "@workspace/db/schema";
import { inArray } from "drizzle-orm";

const RUN_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
export const TEST_PREFIX = `[TEST:${RUN_ID}]`;

const ids = {
  tenants: new Set<number>(),
  bookings: new Set<number>(),
  invoices: new Set<number>(),
  payments: new Set<number>(),
  mallUnits: new Set<number>(),
  shifts: new Set<number>(),
};

export function track(type: keyof typeof ids, id: number) {
  ids[type].add(id);
}

export async function createTestTenant(overrides: Record<string, unknown> = {}) {
  const [row] = await db
    .insert(tenantsTable)
    .values({
      businessName: `${TEST_PREFIX} Toko Uji`,
      ownerName: "Pemilik Uji",
      status: "active",
      areaName: "",
      ...overrides,
    })
    .returning();
  ids.tenants.add(row.id);
  return row;
}

export async function createTestUnit(overrides: Record<string, unknown> = {}) {
  const code = `T-${RUN_ID.slice(0, 6)}-${ids.mallUnits.size + 1}-${Date.now().toString(36)}`;
  const [row] = await db
    .insert(mallUnitsTable)
    .values({
      unitCode: (overrides.unitCode as string) ?? code,
      floor: "1",
      status: "available",
      ...overrides,
    })
    .returning();
  ids.mallUnits.add(row.id);
  return row;
}

export async function createTestBooking(tenantId: number, overrides: Record<string, unknown> = {}) {
  const today = new Date();
  const future = new Date(today);
  future.setFullYear(today.getFullYear() + 1);

  const [row] = await db
    .insert(tenantBookingsTable)
    .values({
      tenantId,
      unitCode: `U-${RUN_ID.slice(0, 4)}`,
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
      paymentStatus: "UNPAID",
      contractStatus: "active",
      bookingStatus: "aktif",
      status: "active",
      ...overrides,
    } as any)
    .returning();
  ids.bookings.add(row.id);
  return row;
}

export async function createTestInvoice(
  tenantId: number,
  bookingId?: number,
  overrides: Record<string, unknown> = {},
) {
  const now = new Date();
  const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const seq = String(ids.invoices.size + 1).padStart(5, "0");
  const invoiceNumber = `INV-TEST/${yyyymm}/${seq}-${RUN_ID.slice(0, 4)}`;

  const due = new Date(now);
  due.setDate(due.getDate() + 30);

  const [row] = await db
    .insert(tenantInvoicesTable)
    .values({
      invoiceNumber,
      tenantId,
      bookingId: bookingId ?? null,
      rentAmount: "5000000",
      totalAmount: "5000000",
      paidAmount: "0",
      outstandingAmount: "5000000",
      status: "unpaid",
      dueDate: due.toISOString().slice(0, 10),
      periodStart: now.toISOString().slice(0, 10),
      periodEnd: due.toISOString().slice(0, 10),
      ...overrides,
    } as any)
    .returning();
  ids.invoices.add(row.id);
  return row;
}

export async function createTestPayment(
  tenantId: number,
  bookingId: number,
  overrides: Record<string, unknown> = {},
) {
  const receiptNumber = `TEST-PAY-${Date.now()}-${RUN_ID.slice(0, 4)}`;
  const [row] = await db
    .insert(tenantPaymentsTable)
    .values({
      tenantId,
      bookingId,
      tenantBookingId: bookingId,
      receiptNumber,
      amount: "5000000",
      method: "tunai",
      paymentMethod: "tunai",
      status: "PAID",
      paymentStatus: "PAID",
      isVoided: false,
      paidAt: new Date(),
      ...overrides,
    } as any)
    .returning();
  ids.payments.add(row.id);
  return row;
}

export async function createTestShift(overrides: Record<string, unknown> = {}) {
  const [row] = await db
    .insert(cashierShiftsTable)
    .values({
      cashierName: `Test Kasir ${RUN_ID.slice(0, 4)}`,
      openedAt: new Date(),
      status: "open",
      expectedCash: "0",
      actualCash: "0",
      cashDifference: "0",
      ...overrides,
    } as any)
    .returning();
  ids.shifts.add(row.id);
  return row;
}

export async function cleanupAll() {
  const tenantList = [...ids.tenants];

  try {
    if (tenantList.length > 0) {
      await db.delete(tenantPaymentsTable).where(inArray(tenantPaymentsTable.tenantId, tenantList));
      await db.delete(tenantInvoicesTable).where(inArray(tenantInvoicesTable.tenantId, tenantList));
      await db.delete(tenantBookingsTable).where(inArray(tenantBookingsTable.tenantId, tenantList));
      await db.delete(tenantsTable).where(inArray(tenantsTable.id, tenantList));
    }

    if (ids.mallUnits.size > 0) {
      await db.delete(mallUnitsTable).where(inArray(mallUnitsTable.id, [...ids.mallUnits]));
    }
    if (ids.shifts.size > 0) {
      await db.delete(cashierShiftsTable).where(inArray(cashierShiftsTable.id, [...ids.shifts]));
    }
  } catch (err) {
    console.warn("cleanupAll warning:", (err as Error).message);
  } finally {
    ids.tenants.clear();
    ids.bookings.clear();
    ids.invoices.clear();
    ids.payments.clear();
    ids.mallUnits.clear();
    ids.shifts.clear();
  }
}

export async function cleanupTestData(tenantIds: number[]): Promise<void> {
  if (tenantIds.length === 0) return;
  try {
    await db.delete(tenantPaymentsTable).where(inArray(tenantPaymentsTable.tenantId, tenantIds));
    await db.delete(tenantInvoicesTable).where(inArray(tenantInvoicesTable.tenantId, tenantIds));
    await db.delete(tenantBookingsTable).where(inArray(tenantBookingsTable.tenantId, tenantIds));
    await db.delete(tenantsTable).where(inArray(tenantsTable.id, tenantIds));
  } catch (err) {
    console.warn("cleanupTestData warning:", (err as Error).message);
  }
}

export { createTestTenant as createTenant, createTestBooking as createBooking };
