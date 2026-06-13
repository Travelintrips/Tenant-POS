import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { mallSitesTable } from "./mall-sites";

export const userSiteAccessTable = pgTable("user_site_access", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  siteId: integer("site_id")
    .notNull()
    .references(() => mallSitesTable.id),
  role: text("role").notNull().default("admin"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type UserSiteAccess = typeof userSiteAccessTable.$inferSelect;
export type InsertUserSiteAccess = typeof userSiteAccessTable.$inferInsert;
