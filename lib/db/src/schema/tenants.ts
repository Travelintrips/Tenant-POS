import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const TENANT_STATUSES = ["active", "inactive", "blacklisted", "aktif", "kosong", "nonaktif"] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

export const tenantsTable = pgTable("tenants", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id"),
  userId: integer("user_id"),
  businessName: text("business_name").notNull(),
  ownerName: text("owner_name").notNull(),
  phone: text("phone"),
  email: text("email"),
  businessCategory: text("business_category"),
  category: text("category"),
  boothNumber: text("booth_number"),
  areaName: text("area_name").notNull().default(""),
  logoUrl: text("logo_url"),
  address: text("address"),
  status: text("status").notNull().default("active"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTenantSchema = createInsertSchema(tenantsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTenant = z.infer<typeof insertTenantSchema>;
export type Tenant = typeof tenantsTable.$inferSelect;
