CREATE TYPE "public"."tenant_status" AS ENUM('aktif', 'kosong', 'nonaktif');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('aktif', 'selesai', 'pending', 'batal');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('UNPAID', 'PARTIAL', 'PAID', 'OVERDUE');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('tunai', 'transfer', 'qris');--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" serial PRIMARY KEY NOT NULL,
	"business_name" text NOT NULL,
	"owner_name" text NOT NULL,
	"email" text,
	"phone" text,
	"category" text,
	"booth_number" text,
	"area_name" text NOT NULL,
	"status" "tenant_status" DEFAULT 'aktif' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_bookings" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"total_amount" integer DEFAULT 0 NOT NULL,
	"paid_amount" integer DEFAULT 0 NOT NULL,
	"payment_status" "payment_status" DEFAULT 'UNPAID' NOT NULL,
	"booking_status" "booking_status" DEFAULT 'aktif' NOT NULL,
	"due_date" date,
	"period_label" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"booking_id" integer NOT NULL,
	"amount" integer NOT NULL,
	"payment_method" "payment_method" DEFAULT 'tunai' NOT NULL,
	"notes" text,
	"paid_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenant_bookings" ADD CONSTRAINT "tenant_bookings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_payments" ADD CONSTRAINT "tenant_payments_booking_id_tenant_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."tenant_bookings"("id") ON DELETE no action ON UPDATE no action;