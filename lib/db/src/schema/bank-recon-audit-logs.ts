import { pgTable, serial, integer, text, jsonb, timestamp } from "drizzle-orm/pg-core";

export const bankReconAuditLogsTable = pgTable("bank_recon_audit_logs", {
  id: serial("id").primaryKey(),
  mutationId: integer("mutation_id"),
  matchId: integer("match_id"),
  financePaymentEventId: integer("finance_payment_event_id"),
  journalId: text("journal_id"),
  action: text("action").notNull(),
  actionApp: text("action_app"),
  actionUserId: text("action_user_id"),
  actionRole: text("action_role"),
  ownerApp: text("owner_app"),
  ownerCompanyId: integer("owner_company_id"),
  ownerTenantId: integer("owner_tenant_id"),
  sourceApp: text("source_app"),
  sourceModule: text("source_module"),
  beforeValue: jsonb("before_value"),
  afterValue: jsonb("after_value"),
  metadata: jsonb("metadata"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type BankReconAuditLog = typeof bankReconAuditLogsTable.$inferSelect;
export type InsertBankReconAuditLog = typeof bankReconAuditLogsTable.$inferInsert;
