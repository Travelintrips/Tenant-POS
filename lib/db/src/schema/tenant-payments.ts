import { pgTable, serial, integer, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantBookingsTable } from "./tenant-bookings";

export const paymentMethodEnum = pgEnum("payment_method", ["tunai", "transfer", "qris"]);

export const tenantPaymentsTable = pgTable("tenant_payments", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id").notNull().references(() => tenantBookingsTable.id),
  amount: integer("amount").notNull(),
  paymentMethod: paymentMethodEnum("payment_method").notNull().default("tunai"),
  notes: text("notes"),
  paidAt: timestamp("paid_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const tenantPaymentsRelations = relations(tenantPaymentsTable, ({ one }) => ({
  booking: one(tenantBookingsTable, { fields: [tenantPaymentsTable.bookingId], references: [tenantBookingsTable.id] }),
}));

export const tenantBookingPaymentsRelations = relations(tenantBookingsTable, ({ many }) => ({
  payments: many(tenantPaymentsTable),
}));

export const insertTenantPaymentSchema = createInsertSchema(tenantPaymentsTable).omit({ id: true, createdAt: true });
export type InsertTenantPayment = z.infer<typeof insertTenantPaymentSchema>;
export type TenantPayment = typeof tenantPaymentsTable.$inferSelect;
