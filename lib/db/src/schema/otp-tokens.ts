import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const otpTokensTable = pgTable("otp_tokens", {
  id: serial("id").primaryKey(),
  phoneNumber: text("phone_number").notNull(),
  otpHash: text("otp_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  attempts: integer("attempts").notNull().default(0),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type OtpToken = typeof otpTokensTable.$inferSelect;
export type InsertOtpToken = typeof otpTokensTable.$inferInsert;
