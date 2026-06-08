import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantBookingsTable, paymentStatusEnum } from "./tenant-bookings";
import { tenantsTable } from "./tenants";
import { pgEnum } from "drizzle-orm/pg-core";

export const paymentMethodEnum = pgEnum("payment_method", ["tunai", "transfer", "qris", "edc", "other"]);

export const tenantPaymentsTable = pgTable("tenant_payments", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id").notNull().references(() => tenantBookingsTable.id),
  tenantId: integer("tenant_id").references(() => tenantsTable.id),
  amount: integer("amount").notNull(),
  discountAmount: integer("discount_amount").notNull().default(0),
  penaltyAmount: integer("penalty_amount").notNull().default(0),
  paymentMethod: paymentMethodEnum("payment_method").notNull().default("tunai"),
  paymentStatus: paymentStatusEnum("payment_status").notNull().default("PAID"),
  receiptNumber: text("receipt_number"),
  notes: text("notes"),
  createdBy: integer("created_by"),
  paidAt: timestamp("paid_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const tenantPaymentsRelations = relations(tenantPaymentsTable, ({ one }) => ({
  booking: one(tenantBookingsTable, { fields: [tenantPaymentsTable.bookingId], references: [tenantBookingsTable.id] }),
  tenant: one(tenantsTable, { fields: [tenantPaymentsTable.tenantId], references: [tenantsTable.id] }),
}));

export const tenantBookingPaymentsRelations = relations(tenantBookingsTable, ({ many }) => ({
  payments: many(tenantPaymentsTable),
}));

export const insertTenantPaymentSchema = createInsertSchema(tenantPaymentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTenantPayment = z.infer<typeof insertTenantPaymentSchema>;
export type TenantPayment = typeof tenantPaymentsTable.$inferSelect;
