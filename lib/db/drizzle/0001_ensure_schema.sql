CREATE TABLE IF NOT EXISTS "tenants" (
  "id" serial PRIMARY KEY NOT NULL,
  "company_id" integer DEFAULT 1,
  "user_id" integer,
  "business_name" text NOT NULL,
  "owner_name" text NOT NULL,
  "phone" text,
  "email" text,
  "business_category" text,
  "logo_url" text,
  "address" text,
  "status" text NOT NULL DEFAULT 'aktif',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_bookings" (
  "id" serial PRIMARY KEY NOT NULL,
  "company_id" integer DEFAULT 1,
  "order_number" text NOT NULL DEFAULT '',
  "tenant_id" integer NOT NULL,
  "user_id" integer,
  "booking_type" text NOT NULL DEFAULT 'sewa',
  "start_date" date,
  "end_date" date,
  "duration_months" integer,
  "requested_area" text,
  "description" text,
  "price" numeric NOT NULL DEFAULT '0',
  "payment_status" text NOT NULL DEFAULT 'UNPAID',
  "status" text NOT NULL DEFAULT 'aktif',
  "admin_notes" text,
  "payment_period_type" text NOT NULL DEFAULT 'monthly',
  "period_start_month" integer,
  "period_start_year" integer,
  "period_end_month" integer,
  "period_end_year" integer,
  "total_months" integer,
  "monthly_price" numeric,
  "yearly_price" numeric,
  "total_price" numeric,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_payments" (
  "id" serial PRIMARY KEY NOT NULL,
  "company_id" integer,
  "tenant_booking_id" integer NOT NULL,
  "payment_number" text,
  "proof_image_url" text,
  "amount" numeric NOT NULL,
  "method" text NOT NULL DEFAULT 'tunai',
  "notes" text,
  "status" text NOT NULL DEFAULT 'PAID',
  "paid_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'tenant_bookings_tenant_id_tenants_id_fk'
  ) THEN
    ALTER TABLE "tenant_bookings"
      ADD CONSTRAINT "tenant_bookings_tenant_id_tenants_id_fk"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'tenant_payments_tenant_booking_id_tenant_bookings_id_fk'
  ) THEN
    ALTER TABLE "tenant_payments"
      ADD CONSTRAINT "tenant_payments_tenant_booking_id_tenant_bookings_id_fk"
      FOREIGN KEY ("tenant_booking_id") REFERENCES "tenant_bookings"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
