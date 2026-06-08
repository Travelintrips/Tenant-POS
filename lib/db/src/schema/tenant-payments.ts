import { pgTable, serial, integer, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantBookingsTable } from "./tenant-bookings";

export const tenantPaymentsTable = pgTable("tenant_payments", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id"),
  tenantBookingId: integer("tenant_booking_id").notNull().references(() => tenantBookingsTable.id),
  paymentNumber: text("payment_number"),
  proofImageUrl: text("proof_image_url"),
  amount: numeric("amount").notNull(),
  method: text("method").notNull().default("tunai"),
  notes: text("notes"),
  status: text("status").notNull().default("PAID"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tenantPaymentsRelations = relations(tenantPaymentsTable, ({ one }) => ({
  booking: one(tenantBookingsTable, { fields: [tenantPaymentsTable.tenantBookingId], references: [tenantBookingsTable.id] }),
}));

export const tenantBookingPaymentsRelations = relations(tenantBookingsTable, ({ many }) => ({
  payments: many(tenantPaymentsTable),
}));

export const insertTenantPaymentSchema = createInsertSchema(tenantPaymentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTenantPayment = z.infer<typeof insertTenantPaymentSchema>;
export type TenantPayment = typeof tenantPaymentsTable.$inferSelect;
