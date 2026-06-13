import { pgTable, serial, integer, text, numeric, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { mallSitesTable } from "./mall-sites";
import { tenantsTable } from "./tenants";

export const financePaymentEventsTable = pgTable("finance_payment_events", {
  id: serial("id").primaryKey(),

  sourceApp: text("source_app").notNull(),
  ownerApp: text("owner_app").notNull(),
  sourceModule: text("source_module").notNull(),
  sourceTable: text("source_table").notNull(),
  sourceId: integer("source_id").notNull(),

  ownerCompanyId: integer("owner_company_id"),
  ownerTenantId: integer("owner_tenant_id"),
  tenantId: integer("tenant_id").references(() => tenantsTable.id),
  siteId: integer("site_id").references(() => mallSitesTable.id),
  invoiceId: integer("invoice_id"),

  amount: numeric("amount").notNull(),
  direction: text("direction").notNull().default("IN"),

  paymentMethod: text("payment_method").notNull(),
  paymentReference: text("payment_reference"),
  externalOrderId: text("external_order_id"),
  paymentStatus: text("payment_status").notNull().default("pending"),
  proofUrl: text("proof_url"),

  bankMutationId: integer("bank_mutation_id"),
  isReconciled: boolean("is_reconciled").notNull().default(false),
  reconciledAt: timestamp("reconciled_at", { withTimezone: true }),

  createdByApp: text("created_by_app"),
  approvalScope: text("approval_scope"),

  metadata: jsonb("metadata"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type FinancePaymentEvent = typeof financePaymentEventsTable.$inferSelect;
export type InsertFinancePaymentEvent = typeof financePaymentEventsTable.$inferInsert;
