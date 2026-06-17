import { pgTable, serial, integer, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod";
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

export const UNIT_CODE_REGEX = /^[A-Z0-9]+(-[A-Z0-9]+)*$/;

export const insertMallUnitSchema = z.object({
  siteId: z.number().int().nullable().optional(),
  unitCode: z
    .string()
    .min(2, "Kode unit minimal 2 karakter")
    .max(30, "Kode unit maksimal 30 karakter")
    .regex(
      UNIT_CODE_REGEX,
      "Kode unit hanya boleh huruf kapital, angka, dan tanda hubung (-). Tidak boleh diawali/diakhiri tanda hubung atau menggunakan tanda hubung berurutan.",
    ),
  floor: z.string().default("Main"),
  zone: z.string().nullable().optional(),
  areaKantin: z.string().nullable().optional(),
  unitType: z.string().default("other"),
  sizeM2: z.string().nullable().optional(),
  defaultRentAmount: z.string().optional().default("0"),
  status: z.string().default("available"),
  positionX: z.number().int().default(0),
  positionY: z.number().int().default(0),
  width: z.number().int().default(2),
  height: z.number().int().default(2),
  notes: z.string().nullable().optional(),
});

export type InsertMallUnit = z.infer<typeof insertMallUnitSchema>;
export type MallUnit = typeof mallUnitsTable.$inferSelect;
