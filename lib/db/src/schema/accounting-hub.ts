import {
  pgTable, serial, integer, text, numeric, date, timestamp, boolean, pgEnum,
} from "drizzle-orm/pg-core";

// Fix 1: Enum schema untuk accounting_entry_source
// Nilai-nilai valid yang harus ada di PostgreSQL enum (termasuk tenant payment)
export const accountingEntrySource = pgEnum("accounting_entry_source", [
  "manual",
  "sales_invoice",
  "purchase_bill",
  "sales_payment",
  "purchase_payment",
  "pos_sale",
  "ecommerce_order",
  "stock_received",
  "manual_payment",
  "reversal",
  "cogs_delivery",
  "purchase_return",
  "sales_return",
  "opname_adjust",
  "damage_adjust",
  "grn_receipt",
  "sport_center_booking",
  "sport_center_refund",
  "sport_center_membership",
  "sport_center_booking_refund",
  "sport_center_operational_expense",
  "sport_center_booking_reversal",
  "logistic_vendor_cost",
  "bank_mutation_import",
  "payroll",
  "tenant_rent_payment",
  "tenant_sc_payment",
]);

export type AccountingEntrySourceType = typeof accountingEntrySource.enumValues[number];

export const accountingEntriesTable = pgTable("accounting_entries", {
  id: serial("id").primaryKey(),
  entryNumber: text("entry_number").notNull().unique(),
  journalId: integer("journal_id").notNull(),
  date: date("date").notNull(),
  ref: text("ref"),
  description: text("description"),
  status: text("status").notNull().default("draft"),
  source: text("source"),
  sourceModule: text("source_module"),
  sourceTable: text("source_table"),
  sourceId: integer("source_id"),
  companyId: integer("company_id"),
  branchId: integer("branch_id"),
  divisionId: integer("division_id"),
  totalDebit: numeric("total_debit").notNull().default("0"),
  totalCredit: numeric("total_credit").notNull().default("0"),
  correlationId: text("correlation_id").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const accountingEntryLinesTable = pgTable("accounting_entry_lines", {
  id: serial("id").primaryKey(),
  entryId: integer("entry_id").notNull(),
  accountId: integer("account_id"),
  description: text("description"),
  debit: numeric("debit").notNull().default("0"),
  credit: numeric("credit").notNull().default("0"),
  companyId: integer("company_id"),
  branchId: integer("branch_id"),
  divisionId: integer("division_id"),
  sourceModule: text("source_module"),
  sourceTable: text("source_table"),
  sourceId: integer("source_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const accountingPaymentsTable = pgTable("accounting_payments", {
  id: serial("id").primaryKey(),
  entryId: integer("entry_id"),
  companyId: integer("company_id"),
  branchId: integer("branch_id"),
  divisionId: integer("division_id"),
  sourceModule: text("source_module"),
  sourceTable: text("source_table"),
  sourceId: integer("source_id"),
  paymentMethod: text("payment_method").notNull().default("cash"),
  amount: numeric("amount").notNull().default("0"),
  currency: text("currency").notNull().default("IDR"),
  paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
  ref: text("ref"),
  description: text("description"),
  status: text("status").notNull().default("completed"),
  correlationId: text("correlation_id").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const taxTransactionsTable = pgTable("tax_transactions", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id"),
  branchId: integer("branch_id"),
  divisionId: integer("division_id"),
  sourceModule: text("source_module"),
  sourceTable: text("source_table"),
  sourceId: integer("source_id"),
  taxType: text("tax_type").notNull(),
  taxRate: numeric("tax_rate").notNull().default("0"),
  taxableAmount: numeric("taxable_amount").notNull().default("0"),
  taxAmount: numeric("tax_amount").notNull().default("0"),
  direction: text("direction").notNull().default("out"),
  period: text("period"),
  status: text("status").notNull().default("draft"),
  correlationId: text("correlation_id").unique(),
  ref: text("ref"),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const taxSettingsTable = pgTable("tax_settings", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id"),
  branchId: integer("branch_id"),
  divisionId: integer("division_id"),
  taxType: text("tax_type").notNull(),
  rate: numeric("rate").notNull().default("0"),
  isActive: boolean("is_active").notNull().default(true),
  effectiveFrom: date("effective_from"),
  effectiveTo: date("effective_to"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AccountingEntry = typeof accountingEntriesTable.$inferSelect;
export type InsertAccountingEntry = typeof accountingEntriesTable.$inferInsert;
export type AccountingEntryLine = typeof accountingEntryLinesTable.$inferSelect;
export type InsertAccountingEntryLine = typeof accountingEntryLinesTable.$inferInsert;
export type AccountingPayment = typeof accountingPaymentsTable.$inferSelect;
export type InsertAccountingPayment = typeof accountingPaymentsTable.$inferInsert;
export type TaxTransaction = typeof taxTransactionsTable.$inferSelect;
export type InsertTaxTransaction = typeof taxTransactionsTable.$inferInsert;
export type TaxSetting = typeof taxSettingsTable.$inferSelect;
export type InsertTaxSetting = typeof taxSettingsTable.$inferInsert;
