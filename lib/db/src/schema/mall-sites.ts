import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const SITE_TYPES = ["mall_tenant", "sport_center"] as const;
export type SiteType = (typeof SITE_TYPES)[number];

export const SITE_STATUSES = ["active", "inactive"] as const;
export type SiteStatus = (typeof SITE_STATUSES)[number];

export const mallSitesTable = pgTable("mall_sites", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  type: text("type").notNull().default("mall_tenant"),
  address: text("address"),
  status: text("status").notNull().default("active"),
  companyName: text("company_name").notNull().default("Manajemen CST"),
  invoicePrefix: text("invoice_prefix").notNull().default("INV"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMallSiteSchema = createInsertSchema(mallSitesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertMallSite = typeof mallSitesTable.$inferInsert;
export type MallSite = typeof mallSitesTable.$inferSelect;
