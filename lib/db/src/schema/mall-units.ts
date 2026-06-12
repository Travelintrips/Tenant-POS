import { pgTable, serial, integer, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { mallSitesTable } from "./mall-sites";

export const UNIT_STATUSES = ["available", "booked", "occupied", "overdue", "expired", "maintenance"] as const;
export type UnitStatus = (typeof UNIT_STATUSES)[number];

export const UNIT_TYPES = ["food_booth", "beverage_booth", "shared_kitchen", "storage", "cashier_area", "seating_area", "other"] as const;
export type UnitType = (typeof UNIT_TYPES)[number];

export const mallUnitsTable = pgTable("mall_units", {
  id: serial("id").primaryKey(),
  siteId: integer("site_id").references(() => mallSitesTable.id),
  unitCode: text("unit_code").notNull(),
  floor: text("floor").notNull().default("Main"),
  zone: text("zone"),
  areaKantin: text("area_kantin"),
  unitType: text("unit_type").notNull().default("other"),
  sizeM2: numeric("size_m2"),
  defaultRentAmount: numeric("default_rent_amount").default("0"),
  status: text("status").notNull().default("available"),
  positionX: integer("position_x").notNull().default(0),
  positionY: integer("position_y").notNull().default(0),
  width: integer("width").notNull().default(2),
  height: integer("height").notNull().default(2),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMallUnitSchema = createInsertSchema(mallUnitsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMallUnit = z.infer<typeof insertMallUnitSchema>;
export type MallUnit = typeof mallUnitsTable.$inferSelect;
