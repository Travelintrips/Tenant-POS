import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { tenantsTable } from "./tenants";
import { mallSitesTable } from "./mall-sites";

export const TENANT_ACCESS_LEVELS = ["owner", "staff", "viewer"] as const;
export type TenantAccessLevel = (typeof TENANT_ACCESS_LEVELS)[number];

export const TENANT_ACCESS_STATUSES = ["active", "inactive"] as const;
export type TenantAccessStatus = (typeof TENANT_ACCESS_STATUSES)[number];

export const tenantUserAccessTable = pgTable("tenant_user_access", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenantsTable.id),
  siteId: integer("site_id")
    .notNull()
    .references(() => mallSitesTable.id),
  accessLevel: text("access_level").notNull().default("viewer"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TenantUserAccess = typeof tenantUserAccessTable.$inferSelect;
export type InsertTenantUserAccess = typeof tenantUserAccessTable.$inferInsert;
