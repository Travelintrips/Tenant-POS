import { db } from "@workspace/db";
import {
  tenantsTable,
  tenantBookingsTable,
  tenantInvoicesTable,
  tenantPaymentsTable,
  type TenantBooking,
} from "@workspace/db/schema";
import { eq, inArray } from "drizzle-orm";

const TEST_PREFIX = "__TEST__";

export interface FactoryTenant {
  id: number;
  businessName: string;
}

export interface FactoryBooking extends TenantBooking {}

export async function createTenant(
  overrides: Partial<typeof tenantsTable.$inferInsert> = {},
): Promise<FactoryTenant> {
  const [tenant] = await db
    .insert(tenantsTable)
    .values({
      businessName: `${TEST_PREFIX}Business ${Date.now()}`,
      ownerName: "Test Owner",
      areaName: "Test Area",
      status: "active",
      ...overrides,
    })
    .returning({ id: tenantsTable.id, businessName: tenantsTable.businessName });
  return tenant;
}

export async function createBooking(
  tenantId: number,
  overrides: Partial<typeof tenantBookingsTable.$inferInsert> = {},
): Promise<FactoryBooking> {
  const [booking] = await db
    .insert(tenantBookingsTable)
    .values({
      tenantId,
      orderNumber: `TEST-ORD-${Date.now()}`,
      bookingType: "sewa",
      unitCode: "A-01",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      billingCycle: "monthly",
      rentAmount: "5000000",
      serviceChargeAmount: "500000",
      electricityChargeAmount: "300000",
      waterChargeAmount: "100000",
      status: "aktif",
      bookingStatus: "aktif",
      contractStatus: "active",
      ...overrides,
    })
    .returning();
  return booking;
}

export async function cleanupTestData(tenantIds: number[]): Promise<void> {
  if (tenantIds.length === 0) return;

  const bookings = await db
    .select({ id: tenantBookingsTable.id })
    .from(tenantBookingsTable)
    .where(inArray(tenantBookingsTable.tenantId, tenantIds));

  const bookingIds = bookings.map((b) => b.id);

  const invoices = await db
    .select({ id: tenantInvoicesTable.id })
    .from(tenantInvoicesTable)
    .where(inArray(tenantInvoicesTable.tenantId, tenantIds));

  const invoiceIds = invoices.map((i) => i.id);

  if (invoiceIds.length > 0) {
    await db
      .delete(tenantPaymentsTable)
      .where(inArray(tenantPaymentsTable.invoiceId, invoiceIds));
    await db
      .delete(tenantInvoicesTable)
      .where(inArray(tenantInvoicesTable.tenantId, tenantIds));
  }

  if (bookingIds.length > 0) {
    await db
      .delete(tenantBookingsTable)
      .where(inArray(tenantBookingsTable.tenantId, tenantIds));
  }

  await db.delete(tenantsTable).where(inArray(tenantsTable.id, tenantIds));
}
