import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { mallSitesTable } from "./mall-sites";

export const bankClosingPeriodsTable = pgTable("bank_closing_periods", {
  id: serial("id").primaryKey(),
  yearMonth: text("year_month").notNull().unique(),
  lockedBy: text("locked_by"),
  lockedByRole: text("locked_by_role"),
  notes: text("notes"),
  siteId: integer("site_id").references(() => mallSitesTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type BankClosingPeriod = typeof bankClosingPeriodsTable.$inferSelect;
export type InsertBankClosingPeriod = typeof bankClosingPeriodsTable.$inferInsert;
