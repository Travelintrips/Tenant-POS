import { pgTable, serial, integer, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { mallSitesTable } from "./mall-sites";

export const bankAccountBalancesTable = pgTable("bank_account_balances", {
  id: serial("id").primaryKey(),
  bankAccountId: text("bank_account_id").notNull(),
  companyId: integer("company_id"),
  ownerApp: text("owner_app"),
  ownerTenantId: integer("owner_tenant_id"),
  siteId: integer("site_id").references(() => mallSitesTable.id),
  currentBalance: numeric("current_balance").notNull().default("0"),
  lastReconciledBalance: numeric("last_reconciled_balance"),
  lastReconciledAt: timestamp("last_reconciled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type BankAccountBalance = typeof bankAccountBalancesTable.$inferSelect;
export type InsertBankAccountBalance = typeof bankAccountBalancesTable.$inferInsert;
