import { pgTable, serial, integer, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { mallSitesTable } from "./mall-sites";
import { tenantsTable } from "./tenants";
import { usersTable } from "./users";

export const operationalExpensesTable = pgTable("operational_expenses", {
  id: serial("id").primaryKey(),
  siteId: integer("site_id").references(() => mallSitesTable.id),
  tenantId: integer("tenant_id").references(() => tenantsTable.id),
  category: text("category").notNull().default("lain-lain"),
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
