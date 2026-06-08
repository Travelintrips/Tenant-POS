import { pgTable, serial, integer, text, date, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const paymentStatusEnum = pgEnum("payment_status", ["UNPAID", "PARTIAL", "PAID", "OVERDUE", "CANCELLED"]);
export const bookingStatusEnum = pgEnum("booking_status", ["aktif", "selesai", "pending", "batal"]);

export const tenantBookingsTable = pgTable("tenant_bookings", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenantsTable.id),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  totalAmount: integer("total_amount").notNull().default(0),
  paidAmount: integer("paid_amount").notNull().default(0),
  paymentStatus: paymentStatusEnum("payment_status").notNull().default("UNPAID"),
  bookingStatus: bookingStatusEnum("booking_status").notNull().default("aktif"),
  dueDate: date("due_date"),
  periodLabel: text("period_label"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
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
