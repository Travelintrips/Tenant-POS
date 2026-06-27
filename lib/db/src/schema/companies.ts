import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const companiesTable = pgTable("companies", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  companyName: text("company_name"),
  companyCode: text("company_code"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Company = typeof companiesTable.$inferSelect;
export type InsertCompany = typeof companiesTable.$inferInsert;
