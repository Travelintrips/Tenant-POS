import { pgTable, serial, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tenantStatusEnum = pgEnum("tenant_status", ["aktif", "kosong", "nonaktif"]);

export const tenantsTable = pgTable("tenants", {
  id: serial("id").primaryKey(),
  businessName: text("business_name").notNull(),
  ownerName: text("owner_name").notNull(),
  email: text("email"),
  phone: text("phone"),
  category: text("category"),
  boothNumber: text("booth_number"),
  areaName: text("area_name").notNull(),
  status: tenantStatusEnum("status").notNull().default("aktif"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertTenantSchema = createInsertSchema(tenantsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTenant = z.infer<typeof insertTenantSchema>;
export type Tenant = typeof tenantsTable.$inferSelect;
