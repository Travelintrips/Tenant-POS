import { pgTable, serial, integer, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { mallSitesTable } from "./mall-sites";

export const cashierShiftsTable = pgTable("cashier_shifts", {
  id: serial("id").primaryKey(),
  siteId: integer("site_id").references(() => mallSitesTable.id),
  cashierName: text("cashier_name").notNull(),
  cashierId: integer("cashier_id"),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  expectedCash: numeric("expected_cash").notNull().default("0"),
  actualCash: numeric("actual_cash"),
  cashDifference: numeric("cash_difference"),
  notes: text("notes"),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCashierShiftSchema = createInsertSchema(cashierShiftsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCashierShift = z.infer<typeof insertCashierShiftSchema>;
export type CashierShift = typeof cashierShiftsTable.$inferSelect;
