import { pgTable, serial, integer, text, date, numeric, timestamp, boolean } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { tenantsTable } from "./tenants";
import { tenantBookingsTable } from "./tenant-bookings";
import { mallSitesTable } from "./mall-sites";

export const INVOICE_STATUSES = ["draft", "unpaid", "partial", "paid", "overdue", "cancelled"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const tenantInvoicesTable = pgTable("tenant_invoices", {
  id: serial("id").primaryKey(),
  siteId: integer("site_id").references(() => mallSitesTable.id),
  invoiceNumber: text("invoice_number").notNull().unique(),
  tenantId: integer("tenant_id").notNull().references(() => tenantsTable.id),
  bookingId: integer("booking_id").references(() => tenantBookingsTable.id),
  unitCode: text("unit_code"),
  periodStart: date("period_start"),
  periodEnd: date("period_end"),
  dueDate: date("due_date"),
  rentAmount: numeric("rent_amount").notNull().default("0"),
  serviceChargeAmount: numeric("service_charge_amount").notNull().default("0"),
  electricityChargeAmount: numeric("electricity_charge_amount").notNull().default("0"),
  waterChargeAmount: numeric("water_charge_amount").notNull().default("0"),
  otherChargeAmount: numeric("other_charge_amount").notNull().default("0"),
  trashChargeAmount: numeric("trash_charge_amount").notNull().default("0"),
  discountAmount: numeric("discount_amount").notNull().default("0"),
  penaltyAmount: numeric("penalty_amount").notNull().default("0"),
  subtotal: numeric("subtotal").notNull().default("0"),
  taxAmount: numeric("tax_amount").notNull().default("0"),
  ppnAmount: numeric("ppn_amount").notNull().default("0"),
  totalAmount: numeric("total_amount").notNull().default("0"),
  paidAmount: numeric("paid_amount").notNull().default("0"),
  outstandingAmount: numeric("outstanding_amount").notNull().default("0"),
  status: text("status").notNull().default("draft"),
  notes: text("notes"),
  paymentToken: text("payment_token"),
  lastOverdueReminderAt: timestamp("last_overdue_reminder_at", { withTimezone: true }),
  usePpn: boolean("use_ppn").notNull().default(true),
  dueReminder3dAt: timestamp("due_reminder_3d_at", { withTimezone: true }),
  dueReminder1dAt: timestamp("due_reminder_1d_at", { withTimezone: true }),
  invoiceNotifiedAt: timestamp("invoice_notified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tenantInvoicesRelations = relations(tenantInvoicesTable, ({ one }) => ({
  tenant: one(tenantsTable, { fields: [tenantInvoicesTable.tenantId], references: [tenantsTable.id] }),
  booking: one(tenantBookingsTable, { fields: [tenantInvoicesTable.bookingId], references: [tenantBookingsTable.id] }),
}));

export const insertTenantInvoiceSchema = createInsertSchema(tenantInvoicesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTenantInvoice = typeof tenantInvoicesTable.$inferInsert;
export type TenantInvoice = typeof tenantInvoicesTable.$inferSelect;
