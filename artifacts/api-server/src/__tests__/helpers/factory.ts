import { randomUUID } from "node:crypto";
import { db } from "@workspace/db";
import {
  tenantsTable,
  tenantBookingsTable,
  tenantInvoicesTable,
  tenantPaymentsTable,
  mallUnitsTable,
  cashierShiftsTable,
  mallSitesTable,
  usersTable,
  tenantUserAccessTable,
  otpTokensTable,
} from "@workspace/db/schema";
import { eq, inArray } from "drizzle-orm";

const RUN_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
export const TEST_PREFIX = `[TEST:${RUN_ID}]`;

const ids = {
  tenants: new Set<number>(),
  bookings: new Set<number>(),
  invoices: new Set<number>(),
  payments: new Set<number>(),
  mallUnits: new Set<number>(),
  shifts: new Set<number>(),
  users: new Set<string>(),
};

export function track(type: keyof typeof ids, id: number | string) {
  (ids[type] as Set<any>).add(id);
}

let _defaultSite: { id: number; companyId: number | null } | null = null;
export async function getDefaultSiteId(): Promise<number> {
  if (_defaultSite !== null) return _defaultSite.id;
  const [site] = await db
    .select({ id: mallSitesTable.id, companyId: mallSitesTable.companyId })
    .from(mallSitesTable)
    .where(eq(mallSitesTable.code, "TOD_M1_BANDARA"))
    .limit(1);
  if (!site) throw new Error("Default site TOD_M1_BANDARA not found in DB");
  _defaultSite = site;
  return _defaultSite.id;
}

export async function getDefaultSiteCompanyId(): Promise<number | null> {
  if (_defaultSite !== null) return _defaultSite.companyId;
  await getDefaultSiteId(); // populates _defaultSite
  return _defaultSite!.companyId;
}

// Cache for companyId lookups by siteId
const _siteCompanyIdCache = new Map<number, number | null>();
export async function getSiteCompanyId(siteId: number): Promise<number | null> {
  if (_siteCompanyIdCache.has(siteId)) return _siteCompanyIdCache.get(siteId)!;
  const [site] = await db
    .select({ companyId: mallSitesTable.companyId })
    .from(mallSitesTable)
    .where(eq(mallSitesTable.id, siteId))
    .limit(1);
  const companyId = site?.companyId ?? null;
  _siteCompanyIdCache.set(siteId, companyId);
  return companyId;
}

let _sportSiteId: number | null = null;
export async function getSportSiteId(): Promise<number> {
  if (_sportSiteId !== null) return _sportSiteId;
  const [site] = await db
    .select({ id: mallSitesTable.id })
    .from(mallSitesTable)
    .where(eq(mallSitesTable.code, "SPORT_CENTER_BANDARA"))
    .limit(1);
  if (!site) throw new Error("Sport site SPORT_CENTER_BANDARA not found in DB");
  _sportSiteId = site.id;
  return _sportSiteId;
}

export async function createTestTenant(overrides: Record<string, unknown> = {}) {
  const defaultSiteId = await getDefaultSiteId();
  // Determine actual siteId after applying overrides, so we look up the right company
  const actualSiteId = (overrides.siteId as number | undefined) ?? defaultSiteId;
  // Only resolve companyId if caller didn't supply one
  const resolvedCompanyId = "companyId" in overrides
    ? undefined
    : await getSiteCompanyId(actualSiteId);
  const [row] = await db
    .insert(tenantsTable)
    .values({
      siteId: actualSiteId,
      ...(resolvedCompanyId != null ? { companyId: resolvedCompanyId } : {}),
      businessName: `${TEST_PREFIX} Toko Uji`,
      ownerName: "Pemilik Uji",
      status: "active",
      areaName: "",
      ...overrides,
    } as any)
    .returning();
  ids.tenants.add(row.id);
  return row;
}

export async function createTestUnit(overrides: Record<string, unknown> = {}) {
  const siteId = await getDefaultSiteId();
  const code = `T-${RUN_ID.slice(0, 6)}-${ids.mallUnits.size + 1}-${Date.now().toString(36)}`;
  const [row] = await db
    .insert(mallUnitsTable)
    .values({
      siteId,
      unitCode: (overrides.unitCode as string) ?? code,
      floor: "1",
      status: "available",
      ...overrides,
    } as any)
    .returning();
  ids.mallUnits.add(row.id);
  return row;
}

export async function createTestBooking(tenantId: number, overrides: Record<string, unknown> = {}) {
  const siteId = await getDefaultSiteId();
  const today = new Date();
  const future = new Date(today);
  future.setFullYear(today.getFullYear() + 1);

  const [row] = await db
    .insert(tenantBookingsTable)
    .values({
      siteId,
      tenantId,
      orderNumber: `ORD-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
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
  const siteId = await getDefaultSiteId();
  const now = new Date();
  const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const unique = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const invoiceNumber = `INV-TEST/${yyyymm}/${unique}`;

  const due = new Date(now);
  due.setDate(due.getDate() + 30);

  const [row] = await db
    .insert(tenantInvoicesTable)
    .values({
      siteId,
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
  const siteId = await getDefaultSiteId();
  const receiptNumber = `TEST-PAY-${Date.now()}-${RUN_ID.slice(0, 4)}`;
  const [row] = await db
    .insert(tenantPaymentsTable)
    .values({
      siteId,
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

export async function createTestTenantUser(
  tenantId: number,
  siteId: number,
  overrides: Record<string, unknown> = {},
) {
  const phone = `62800${Date.now().toString().slice(-7)}`;
  const [user] = await db
    .insert(usersTable)
    .values({
      id: randomUUID(),
      name: `${TEST_PREFIX} Tenant User`,
      phoneNumber: phone,
      role: "tenant_user",
      status: "active",
      ...overrides,
    } as any)
    .returning();
  ids.users.add(user.id);

  const [access] = await db
    .insert(tenantUserAccessTable)
    .values({ userId: user.id, tenantId, siteId, accessLevel: "viewer", status: "active" })
    .returning();

  return { user, access };
}

export async function createRegisteredPhoneUser(
  phone: string,
  tenantId: number,
  siteId: number,
) {
  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.phoneNumber, phone));

  if (existing) {
    ids.users.add(existing.id);
    return existing;
  }

  const [user] = await db
    .insert(usersTable)
    .values({
      id: randomUUID(),
      name: "Test Tenant Phone",
      phoneNumber: phone,
      role: "tenant_user",
      status: "active",
    } as any)
    .returning();
  ids.users.add(user.id);

  await db
    .insert(tenantUserAccessTable)
    .values({ userId: user.id, tenantId, siteId, accessLevel: "viewer", status: "active" })
    .onConflictDoNothing();

  return user;
}

export async function cleanupAll() {
  const tenantList = [...ids.tenants];
  const userList = [...ids.users];

  try {
    if (userList.length > 0) {
      await db.delete(tenantUserAccessTable).where(inArray(tenantUserAccessTable.userId, userList));
    }
    if (tenantList.length > 0) {
      await db.delete(tenantPaymentsTable).where(inArray(tenantPaymentsTable.tenantId, tenantList));
      await db.delete(tenantInvoicesTable).where(inArray(tenantInvoicesTable.tenantId, tenantList));
      await db.delete(tenantBookingsTable).where(inArray(tenantBookingsTable.tenantId, tenantList));
      await db.delete(tenantsTable).where(inArray(tenantsTable.id, tenantList));
    }
    if (userList.length > 0) {
      await db.delete(usersTable).where(inArray(usersTable.id, userList));
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
    ids.users.clear();
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
