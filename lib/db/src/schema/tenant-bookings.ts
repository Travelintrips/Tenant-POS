import { pgTable, serial, integer, text, date, numeric, timestamp } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const BILLING_CYCLES = ["monthly", "quarterly", "yearly", "custom"] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];

export const CONTRACT_STATUSES = ["draft", "active", "expiring_soon", "expired", "terminated"] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export const PAYMENT_STATUSES = ["unpaid", "partial", "paid", "overdue", "UNPAID", "PARTIAL", "PAID", "OVERDUE"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const tenantBookingsTable = pgTable("tenant_bookings", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id"),
  orderNumber: text("order_number").notNull().default(""),
  contractNumber: text("contract_number"),
  tenantId: integer("tenant_id").notNull().references(() => tenantsTable.id),
  userId: integer("user_id"),
  bookingType: text("booking_type").notNull().default("sewa"),
  unitCode: text("unit_code"),
  floor: text("floor"),
  startDate: date("start_date"),
  endDate: date("end_date"),
  durationMonths: integer("duration_months"),
  billingCycle: text("billing_cycle"),
  requestedArea: text("requested_area"),
  description: text("description"),
  rentAmount: numeric("rent_amount"),
  depositAmount: numeric("deposit_amount"),
  serviceChargeAmount: numeric("service_charge_amount"),
  electricityChargeAmount: numeric("electricity_charge_amount"),
  waterChargeAmount: numeric("water_charge_amount"),
  price: numeric("price").notNull().default("0"),
  paymentStatus: text("payment_status").notNull().default("unpaid"),
  contractStatus: text("contract_status").notNull().default("draft"),
  status: text("status").notNull().default("aktif"),
  bookingStatus: text("booking_status").notNull().default("aktif"),
  adminNotes: text("admin_notes"),
  notes: text("notes"),
  documentUrl: text("document_url"),
  paymentPeriodType: text("payment_period_type").notNull().default("monthly"),
  periodStartMonth: integer("period_start_month"),
  periodStartYear: integer("period_start_year"),
  periodEndMonth: integer("period_end_month"),
  periodEndYear: integer("period_end_year"),
  totalMonths: integer("total_months"),
  monthlyPrice: numeric("monthly_price"),
  yearlyPrice: numeric("yearly_price"),
  totalPrice: numeric("total_price"),
  totalAmount: numeric("total_amount").notNull().default("0"),
  paidAmount: numeric("paid_amount").notNull().default("0"),
  remainingAmount: numeric("remaining_amount").notNull().default("0"),
  dueDate: date("due_date"),
  periodLabel: text("period_label"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tenantBookingsRelations = relations(tenantBookingsTable, ({ one }) => ({
  tenant: one(tenantsTable, { fields: [tenantBookingsTable.tenantId], references: [tenantsTable.id] }),
}));

export const tenantsRelations = relations(tenantsTable, ({ many }) => ({
  bookings: many(tenantBookingsTable),
}));

export const insertTenantBookingSchema = createInsertSchema(tenantBookingsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTenantBooking = z.infer<typeof insertTenantBookingSchema>;
export type TenantBooking = typeof tenantBookingsTable.$inferSelect;
