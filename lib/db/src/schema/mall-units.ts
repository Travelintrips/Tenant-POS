import { pgTable, serial, integer, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const UNIT_STATUSES = ["available", "booked", "occupied", "overdue", "expired", "maintenance"] as const;
export type UnitStatus = (typeof UNIT_STATUSES)[number];

export const mallUnitsTable = pgTable("mall_units", {
  id: serial("id").primaryKey(),
  unitCode: text("unit_code").notNull().unique(),
  floor: text("floor").notNull().default("1"),
  zone: text("zone"),
  sizeM2: numeric("size_m2"),
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
