import { pgTable, serial, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const waLogsTable = pgTable("wa_send_logs", {
  id: serial("id").primaryKey(),
  siteId: integer("site_id"),
  tenantId: integer("tenant_id"),
  invoiceId: integer("invoice_id"),
  phone: text("phone").notNull(),
  messageType: text("message_type").notNull(),
  status: text("status").notNull(),
  errorMessage: text("error_message"),
  sentBy: text("sent_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type WaLog = typeof waLogsTable.$inferSelect;
export type InsertWaLog = typeof waLogsTable.$inferInsert;
