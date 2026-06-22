import { pgTable, serial, integer, text, numeric, timestamp, date } from "drizzle-orm/pg-core";
import { z } from "zod";
import { mallSitesTable } from "./mall-sites";

export const TENANT_STATUSES = ["active", "inactive", "blacklisted", "aktif", "kosong", "nonaktif"] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

export const tenantsTable = pgTable("tenants", {
  id: serial("id").primaryKey(),
  siteId: integer("site_id").references(() => mallSitesTable.id),
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
  defaultRentAmount: numeric("default_rent_amount").default("0"),
  defaultServiceChargeAmount: numeric("default_service_charge_amount").default("0"),
  defaultElectricityChargeAmount: numeric("default_electricity_charge_amount").default("0"),
  defaultWaterChargeAmount: numeric("default_water_charge_amount").default("0"),
  defaultOtherChargeAmount: numeric("default_other_charge_amount").default("0"),
  defaultTrashChargeAmount: numeric("default_trash_charge_amount").default("0"),
  contractStartDate: date("contract_start_date"),
  contractEndDate: date("contract_end_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTenantSchema = z.object({
  siteId: z.number().int().nullable().optional(),
  companyId: z.number().int().nullable().optional(),
  userId: z.number().int().nullable().optional(),
  businessName: z.string().min(1),
  ownerName: z.string().min(1),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  businessCategory: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  boothNumber: z.string().nullable().optional(),
  areaName: z.string().optional().default(""),
  logoUrl: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  status: z.string().optional().default("active"),
  notes: z.string().nullable().optional(),
  defaultRentAmount: z.string().optional().default("0"),
  defaultServiceChargeAmount: z.string().optional().default("0"),
  defaultElectricityChargeAmount: z.string().optional().default("0"),
  defaultWaterChargeAmount: z.string().optional().default("0"),
  defaultOtherChargeAmount: z.string().optional().default("0"),
  defaultTrashChargeAmount: z.string().optional().default("0"),
  contractStartDate: z.string().nullable().optional(),
  contractEndDate: z.string().nullable().optional(),
});

export type InsertTenant = z.infer<typeof insertTenantSchema>;
export const insertTenantSchema = createInsertSchema(tenantsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTenant = typeof tenantsTable.$inferInsert;
export type Tenant = typeof tenantsTable.$inferSelect;
