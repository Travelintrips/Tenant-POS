import { pgTable, serial, integer, text, numeric, timestamp, boolean } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { tenantBookingsTable } from "./tenant-bookings";
import { mallSitesTable } from "./mall-sites";

export const tenantPaymentsTable = pgTable("tenant_payments", {
  id: serial("id").primaryKey(),
  siteId: integer("site_id").references(() => mallSitesTable.id),
  companyId: integer("company_id"),
  tenantBookingId: integer("tenant_booking_id").references(() => tenantBookingsTable.id),
  bookingId: integer("booking_id").references(() => tenantBookingsTable.id),
  invoiceId: integer("invoice_id"),
  tenantId: integer("tenant_id").references(() => tenantsTable.id),
  paymentNumber: text("payment_number"),
  receiptNumber: text("receipt_number"),
  proofImageUrl: text("proof_image_url"),
  amount: numeric("amount").notNull(),
  discountAmount: numeric("discount_amount").notNull().default("0"),
  penaltyAmount: numeric("penalty_amount").notNull().default("0"),
  method: text("method").notNull().default("tunai"),
  paymentMethod: text("payment_method").notNull().default("tunai"),
  notes: text("notes"),
  status: text("status").notNull().default("PAID"),
  paymentStatus: text("payment_status").notNull().default("PAID"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  isVoided: boolean("is_voided").notNull().default(false),
  voidedAt: timestamp("voided_at", { withTimezone: true }),
  voidReason: text("void_reason"),
  voidedBy: text("voided_by"),
  referenceNumber: text("reference_number"),
  proofUrl: text("proof_url"),
  shiftId: integer("shift_id"),
  refundAmount: numeric("refund_amount").notNull().default("0"),
  refundReason: text("refund_reason"),
  refundStatus: text("refund_status"),
  approvalStatus: text("approval_status").notNull().default("approved"),
  rejectionReason: text("rejection_reason"),
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  ocrExtractedAmount: numeric("ocr_extracted_amount"),
  ocrRawText: text("ocr_raw_text"),
  ocrConfidence: numeric("ocr_confidence"),
  referenceId: text("reference_id"),
  sourceType: text("source_type"),
  remainingBalanceAfter: numeric("remaining_balance_after"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tenantPaymentsRelations = relations(tenantPaymentsTable, ({ one }) => ({
  booking: one(tenantBookingsTable, { fields: [tenantPaymentsTable.bookingId], references: [tenantBookingsTable.id] }),
  tenant: one(tenantsTable, { fields: [tenantPaymentsTable.tenantId], references: [tenantsTable.id] }),
}));

export const tenantBookingPaymentsRelations = relations(tenantBookingsTable, ({ many }) => ({
  payments: many(tenantPaymentsTable),
}));

export const insertTenantPaymentSchema = createInsertSchema(tenantPaymentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTenantPayment = z.infer<typeof insertTenantPaymentSchema>;
export type TenantPayment = typeof tenantPaymentsTable.$inferSelect;
