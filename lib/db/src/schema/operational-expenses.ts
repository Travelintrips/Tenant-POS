import { pgTable, serial, integer, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { mallSitesTable } from "./mall-sites";
import { tenantsTable } from "./tenants";
import { usersTable } from "./users";
import { companiesTable } from "./companies";

export const operationalExpensesTable = pgTable("operational_expenses", {
  id: serial("id").primaryKey(),
  siteId: integer("site_id").references(() => mallSitesTable.id),
  companyId: integer("company_id").references(() => companiesTable.id),
  tenantId: integer("tenant_id").references(() => tenantsTable.id),
  category: text("category").notNull().default("lain-lain"),
  coaCode: text("coa_code"),
  coaName: text("coa_name"),
  coaAccountType: text("coa_account_type"),
  description: text("description"),
  amount: numeric("amount").notNull(),
  paymentMethod: text("payment_method").notNull().default("cash"),
  paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: integer("created_by").references(() => usersTable.id),
  receiptUrl: text("receipt_url"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type OperationalExpense = typeof operationalExpensesTable.$inferSelect;
export type InsertOperationalExpense = typeof operationalExpensesTable.$inferInsert;
