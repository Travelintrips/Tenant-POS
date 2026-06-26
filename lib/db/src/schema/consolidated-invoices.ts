import { pgTable, serial, integer, text, numeric, date, timestamp } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { tenantsTable } from "./tenants";
import { mallSitesTable } from "./mall-sites";
import { tenantInvoicesTable } from "./tenant-invoices";
import { tenantBookingsTable } from "./tenant-bookings";

export const CONSOLIDATED_INVOICE_STATUSES = ["draft", "unpaid", "partial", "paid", "cancelled"] as const;
export type ConsolidatedInvoiceStatus = (typeof CONSOLIDATED_INVOICE_STATUSES)[number];

export const consolidatedInvoicesTable = pgTable("consolidated_invoices", {
  id: serial("id").primaryKey(),
  siteId: integer("site_id").references(() => mallSitesTable.id),
  invoiceNumber: text("invoice_number").notNull().unique(),
  tenantId: integer("tenant_id").notNull().references(() => tenantsTable.id),
  periodLabel: text("period_label"),
  periodStart: date("period_start"),
  periodEnd: date("period_end"),
  dueDate: date("due_date"),
  totalAmount: numeric("total_amount").notNull().default("0"),
  paidAmount: numeric("paid_amount").notNull().default("0"),
  outstandingAmount: numeric("outstanding_amount").notNull().default("0"),
  status: text("status").notNull().default("unpaid"),
  paymentToken: text("payment_token").unique(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const consolidatedInvoiceItemsTable = pgTable("consolidated_invoice_items", {
  id: serial("id").primaryKey(),
  consolidatedInvoiceId: integer("consolidated_invoice_id")
    .notNull()
    .references(() => consolidatedInvoicesTable.id, { onDelete: "cascade" }),
  invoiceId: integer("invoice_id").notNull().references(() => tenantInvoicesTable.id),
  bookingId: integer("booking_id").references(() => tenantBookingsTable.id),
  unitCode: text("unit_code"),
  description: text("description"),
  amount: numeric("amount").notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const consolidatedInvoicesRelations = relations(consolidatedInvoicesTable, ({ one, many }) => ({
  tenant: one(tenantsTable, { fields: [consolidatedInvoicesTable.tenantId], references: [tenantsTable.id] }),
  site: one(mallSitesTable, { fields: [consolidatedInvoicesTable.siteId], references: [mallSitesTable.id] }),
  items: many(consolidatedInvoiceItemsTable),
}));

export const consolidatedInvoiceItemsRelations = relations(consolidatedInvoiceItemsTable, ({ one }) => ({
  consolidatedInvoice: one(consolidatedInvoicesTable, {
    fields: [consolidatedInvoiceItemsTable.consolidatedInvoiceId],
    references: [consolidatedInvoicesTable.id],
  }),
  invoice: one(tenantInvoicesTable, {
    fields: [consolidatedInvoiceItemsTable.invoiceId],
    references: [tenantInvoicesTable.id],
  }),
}));

export type ConsolidatedInvoice = typeof consolidatedInvoicesTable.$inferSelect;
export type ConsolidatedInvoiceItem = typeof consolidatedInvoiceItemsTable.$inferSelect;
