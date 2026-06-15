import { pgTable, serial, integer, text, numeric, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { mallSitesTable } from "./mall-sites";

export const bankMutationsTable = pgTable("bank_mutations", {
  id: serial("id").primaryKey(),
  bankAccountId: text("bank_account_id"),
  transactionDate: text("transaction_date").notNull(),
  description: text("description").notNull().default(""),
  creditAmount: numeric("credit_amount").notNull().default("0"),
  debitAmount: numeric("debit_amount").notNull().default("0"),
  amount: numeric("amount").notNull(),
  direction: text("direction").notNull(),
  mutationKey: text("mutation_key").notNull(),
  normalizedDescription: text("normalized_description").notNull().default(""),
  providerName: text("provider_name"),
  providerOrderId: text("provider_order_id"),
  rawPayload: jsonb("raw_payload"),
  status: text("status").notNull().default("unmatched"),
  matchedPaymentId: integer("matched_payment_id"),
  matchedOrderId: integer("matched_order_id"),
  uploadedProofUrl: text("uploaded_proof_url"),
  siteId: integer("site_id").references(() => mallSitesTable.id),

  companyId: integer("company_id"),
  ownerApp: text("owner_app"),
  ownerCompanyId: integer("owner_company_id"),
  ownerTenantId: integer("owner_tenant_id"),
  sourceApp: text("source_app"),
  sourceModule: text("source_module"),
  sourceTable: text("source_table"),
  sourceId: integer("source_id"),
  approvedByApp: text("approved_by_app"),
  approvedByRole: text("approved_by_role"),
  accountingPosted: boolean("accounting_posted").notNull().default(false),
  journalId: text("journal_id"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type BankMutation = typeof bankMutationsTable.$inferSelect;
export type InsertBankMutation = typeof bankMutationsTable.$inferInsert;
