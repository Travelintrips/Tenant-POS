import { pgTable, serial, text, timestamp, boolean } from "drizzle-orm/pg-core";

export const bankCoaRulesTable = pgTable("bank_coa_rules", {
  id: serial("id").primaryKey(),
  providerName: text("provider_name"),
  direction: text("direction").notNull().default("ALL"),
  descriptionPattern: text("description_pattern"),
  coaCode: text("coa_code").notNull(),
  coaName: text("coa_name").notNull(),
  accountType: text("account_type").notNull().default("other"),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type BankCoaRule = typeof bankCoaRulesTable.$inferSelect;
export type InsertBankCoaRule = typeof bankCoaRulesTable.$inferInsert;
