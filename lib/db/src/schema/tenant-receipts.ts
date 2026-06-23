import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { mallSitesTable } from "./mall-sites";

export const tenantReceiptsTable = pgTable("tenant_receipts", {
  id: serial("id").primaryKey(),
  paymentId: integer("payment_id").notNull(),
  invoiceId: integer("invoice_id"),
  tenantId: integer("tenant_id").notNull(),
  siteId: integer("site_id").references(() => mallSitesTable.id),
  receiptNumber: text("receipt_number").notNull().unique(),
  fileUrl: text("file_url").notNull(),
  invoiceNumber: text("invoice_number"),
  businessName: text("business_name"),
  ownerName: text("owner_name"),
  unitCode: text("unit_code"),
  amountPaid: text("amount_paid").notNull().default("0"),
  taxAmount: text("tax_amount").notNull().default("0"),
  netAmount: text("net_amount").notNull().default("0"),
  paymentMethod: text("payment_method"),
  kasirName: text("kasir_name"),
  journalId: text("journal_id"),
  waStatus: text("wa_status").notNull().default("pending"),
  waError: text("wa_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  migratedFromId: integer("migrated_from_id"),
});

export type TenantReceipt = typeof tenantReceiptsTable.$inferSelect;
export type InsertTenantReceipt = typeof tenantReceiptsTable.$inferInsert;
