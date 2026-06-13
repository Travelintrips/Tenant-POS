import { pgTable, serial, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { bankMutationsTable } from "./bank-mutations";

export const bankReconciliationMatchesTable = pgTable("bank_reconciliation_matches", {
  id: serial("id").primaryKey(),
  mutationId: integer("mutation_id").notNull().references(() => bankMutationsTable.id),
  candidateType: text("candidate_type").notNull(),
  candidateId: integer("candidate_id").notNull(),
  matchScore: integer("match_score").notNull().default(0),
  matchReason: text("match_reason"),
  amountMatch: boolean("amount_match").notNull().default(false),
  dateMatch: boolean("date_match").notNull().default(false),
  nameMatch: boolean("name_match").notNull().default(false),
  orderIdMatch: boolean("order_id_match").notNull().default(false),
  proofMatch: boolean("proof_match").notNull().default(false),
  status: text("status").notNull().default("candidate"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type BankReconciliationMatch = typeof bankReconciliationMatchesTable.$inferSelect;
export type InsertBankReconciliationMatch = typeof bankReconciliationMatchesTable.$inferInsert;
