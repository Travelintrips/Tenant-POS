import { pgTable, serial, integer, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { mallSitesTable } from "./mall-sites";
import { tenantsTable } from "./tenants";

export const otherIncomeTable = pgTable("other_income", {
  id: serial("id").primaryKey(),
  siteId: integer("site_id").references(() => mallSitesTable.id),
  tenantId: integer("tenant_id").references(() => tenantsTable.id),
  category: text("category").notNull().default("other"),
  coaCode: text("coa_code"),
  coaName: text("coa_name"),
  description: text("description").notNull(),
  amount: numeric("amount").notNull(),
  date: timestamp("date", { withTimezone: true }).notNull().defaultNow(),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type OtherIncome = typeof otherIncomeTable.$inferSelect;
export type InsertOtherIncome = typeof otherIncomeTable.$inferInsert;
