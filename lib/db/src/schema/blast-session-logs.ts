import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

export const blastSessionLogsTable = pgTable("blast_session_logs", {
  id: serial("id").primaryKey(),
  siteId: integer("site_id"),
  blastType: text("blast_type").notNull(),
  sentBy: text("sent_by"),
  total: integer("total").notNull().default(0),
  sent: integer("sent").notNull().default(0),
  failed: integer("failed").notNull().default(0),
  skipped: integer("skipped").notNull().default(0),
  metadata: text("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type BlastSessionLog = typeof blastSessionLogsTable.$inferSelect;
export type InsertBlastSessionLog = typeof blastSessionLogsTable.$inferInsert;
