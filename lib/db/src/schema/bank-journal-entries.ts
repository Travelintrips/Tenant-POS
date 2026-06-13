import { pgTable, serial, integer, text, numeric, timestamp, jsonb } from "drizzle-orm/pg-core";
import { bankMutationsTable } from "./bank-mutations";
import { mallSitesTable } from "./mall-sites";

export const bankJournalEntriesTable = pgTable("bank_journal_entries", {
  id: serial("id").primaryKey(),
  journalId: text("journal_id").notNull().unique(),
  mutationId: integer("mutation_id").references(() => bankMutationsTable.id),
  companyId: integer("company_id"),
  ownerApp: text("owner_app"),
  sourceApp: text("source_app"),
  sourceModule: text("source_module"),
  transactionDate: text("transaction_date").notNull(),
  description: text("description").notNull().default(""),
  debitAccountId: text("debit_account_id"),
  creditAccountId: text("credit_account_id"),
  debitAmount: numeric("debit_amount").notNull().default("0"),
  creditAmount: numeric("credit_amount").notNull().default("0"),
  currency: text("currency").notNull().default("IDR"),
  status: text("status").notNull().default("posted"),
  createdBy: text("created_by"),
  siteId: integer("site_id").references(() => mallSitesTable.id),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type BankJournalEntry = typeof bankJournalEntriesTable.$inferSelect;
export type InsertBankJournalEntry = typeof bankJournalEntriesTable.$inferInsert;
