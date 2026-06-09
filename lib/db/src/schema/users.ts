import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const USER_ROLES = ["owner", "admin", "finance", "cashier", "tenant_user"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = ["active", "inactive", "blocked"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").unique(),
  name: text("name").notNull(),
  avatarUrl: text("avatar_url"),
  role: text("role").notNull().default("admin"),
  phoneNumber: text("phone_number"),
  phoneVerifiedAt: timestamp("phone_verified_at", { withTimezone: true }),
  status: text("status").notNull().default("active"),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
