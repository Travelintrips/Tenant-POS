import pg from "pg";
import { dbConfig } from "./config";

const MIGRATIONS: { name: string; sql: string }[] = [
  {
    name: "0002_users_table",
    sql: `
CREATE TABLE IF NOT EXISTS "users" (
  "id" serial PRIMARY KEY NOT NULL,
  "email" text NOT NULL,
  "name" text NOT NULL,
  "avatar_url" text,
  "role" text NOT NULL DEFAULT 'admin',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'users' AND indexname = 'users_email_unique'
  ) THEN
    CREATE UNIQUE INDEX users_email_unique ON "users" ("email");
  END IF;
END $$;
    `.trim(),
  },
  {
    name: "0001_ensure_schema",
    sql: `
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
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

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
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

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
  "paid_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

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
    `.trim(),
  },
  {
    name: "0003_enhance_tenant_contracts",
    sql: `
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenants' AND column_name='notes') THEN
    ALTER TABLE "tenants" ADD COLUMN "notes" text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenants' AND column_name='category') THEN
    ALTER TABLE "tenants" ADD COLUMN "category" text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenants' AND column_name='booth_number') THEN
    ALTER TABLE "tenants" ADD COLUMN "booth_number" text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenants' AND column_name='area_name') THEN
    ALTER TABLE "tenants" ADD COLUMN "area_name" text NOT NULL DEFAULT '';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_bookings' AND column_name='contract_number') THEN
    ALTER TABLE "tenant_bookings" ADD COLUMN "contract_number" text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_bookings' AND column_name='unit_code') THEN
    ALTER TABLE "tenant_bookings" ADD COLUMN "unit_code" text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_bookings' AND column_name='floor') THEN
    ALTER TABLE "tenant_bookings" ADD COLUMN "floor" text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_bookings' AND column_name='billing_cycle') THEN
    ALTER TABLE "tenant_bookings" ADD COLUMN "billing_cycle" text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_bookings' AND column_name='rent_amount') THEN
    ALTER TABLE "tenant_bookings" ADD COLUMN "rent_amount" numeric;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_bookings' AND column_name='deposit_amount') THEN
    ALTER TABLE "tenant_bookings" ADD COLUMN "deposit_amount" numeric;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_bookings' AND column_name='service_charge_amount') THEN
    ALTER TABLE "tenant_bookings" ADD COLUMN "service_charge_amount" numeric;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_bookings' AND column_name='electricity_charge_amount') THEN
    ALTER TABLE "tenant_bookings" ADD COLUMN "electricity_charge_amount" numeric;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_bookings' AND column_name='water_charge_amount') THEN
    ALTER TABLE "tenant_bookings" ADD COLUMN "water_charge_amount" numeric;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_bookings' AND column_name='contract_status') THEN
    ALTER TABLE "tenant_bookings" ADD COLUMN "contract_status" text NOT NULL DEFAULT 'draft';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_bookings' AND column_name='document_url') THEN
    ALTER TABLE "tenant_bookings" ADD COLUMN "document_url" text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_bookings' AND column_name='notes') THEN
    ALTER TABLE "tenant_bookings" ADD COLUMN "notes" text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_bookings' AND column_name='booking_status') THEN
    ALTER TABLE "tenant_bookings" ADD COLUMN "booking_status" text NOT NULL DEFAULT 'aktif';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_bookings' AND column_name='total_amount') THEN
    ALTER TABLE "tenant_bookings" ADD COLUMN "total_amount" numeric NOT NULL DEFAULT '0';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_bookings' AND column_name='paid_amount') THEN
    ALTER TABLE "tenant_bookings" ADD COLUMN "paid_amount" numeric NOT NULL DEFAULT '0';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_bookings' AND column_name='remaining_amount') THEN
    ALTER TABLE "tenant_bookings" ADD COLUMN "remaining_amount" numeric NOT NULL DEFAULT '0';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_bookings' AND column_name='due_date') THEN
    ALTER TABLE "tenant_bookings" ADD COLUMN "due_date" date;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_bookings' AND column_name='period_label') THEN
    ALTER TABLE "tenant_bookings" ADD COLUMN "period_label" text;
  END IF;
END $$;

UPDATE "tenant_bookings" SET contract_status = 'active' WHERE booking_status = 'aktif' AND contract_status = 'draft';
UPDATE "tenant_bookings" SET contract_status = 'expired' WHERE booking_status = 'selesai' AND contract_status = 'draft';
UPDATE "tenant_bookings" SET contract_status = 'terminated' WHERE booking_status = 'batal' AND contract_status = 'draft';

INSERT INTO "tenants" ("business_name","owner_name","phone","email","category","booth_number","area_name","status","notes")
SELECT 'Warung Nasi Bu Sari','Sari Dewi','081234567890','sari@email.com','Kuliner','A-01','Lantai 1','active','Tenant lama, pembayaran selalu tepat waktu'
WHERE NOT EXISTS (SELECT 1 FROM "tenants" LIMIT 1);

INSERT INTO "tenants" ("business_name","owner_name","phone","email","category","booth_number","area_name","status","notes")
SELECT 'Toko Fashion Keren','Budi Santoso','082112345678','budi@fashionkeren.com','Fashion','B-05','Lantai 2','active','Sewa sejak 2023'
WHERE (SELECT count(*) FROM "tenants") < 2;

INSERT INTO "tenants" ("business_name","owner_name","phone","email","category","booth_number","area_name","status","notes")
SELECT 'Kafe Kopi Nusantara','Dewi Rahayu','083312349876','dewi@kopinus.com','F&B','C-10','Lantai 1','active',NULL
WHERE (SELECT count(*) FROM "tenants") < 3;

INSERT INTO "tenants" ("business_name","owner_name","phone","email","category","booth_number","area_name","status","notes")
SELECT 'Apotek Sehat Sejahtera','Hendra Wijaya','085612347654','hendra@apotekss.com','Kesehatan','D-02','Lantai Ground','inactive','Sedang dalam renovasi'
WHERE (SELECT count(*) FROM "tenants") < 4;

DO $$
DECLARE
  t1 integer;
  t2 integer;
  t3 integer;
BEGIN
  SELECT id INTO t1 FROM "tenants" ORDER BY id LIMIT 1 OFFSET 0;
  SELECT id INTO t2 FROM "tenants" ORDER BY id LIMIT 1 OFFSET 1;
  SELECT id INTO t3 FROM "tenants" ORDER BY id LIMIT 1 OFFSET 2;

  IF t1 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "tenant_bookings" LIMIT 1) THEN
    INSERT INTO "tenant_bookings" (
      "tenant_id","contract_number","unit_code","floor","start_date","end_date",
      "billing_cycle","rent_amount","deposit_amount","service_charge_amount",
      "electricity_charge_amount","water_charge_amount","contract_status","payment_status",
      "total_amount","paid_amount","remaining_amount","notes","order_number"
    ) VALUES
    (t1,'KTR/2025/001','A-01','Lantai 1','2025-01-01','2026-01-01','yearly',
      3000000,6000000,500000,300000,150000,'active','paid',
      3950000,3950000,0,'Pembayaran lunas tahunan','KTR/2025/001'),
    (t2,'KTR/2025/002','B-05','Lantai 2','2025-06-01','2026-05-31','monthly',
      5000000,10000000,750000,400000,200000,'active','partial',
      6350000,3000000,3350000,'Cicilan bulan ke-3','KTR/2025/002');
  END IF;

  IF t3 IS NOT NULL AND (SELECT count(*) FROM "tenant_bookings") < 3 THEN
    INSERT INTO "tenant_bookings" (
      "tenant_id","contract_number","unit_code","floor","start_date","end_date",
      "billing_cycle","rent_amount","deposit_amount","service_charge_amount",
      "electricity_charge_amount","water_charge_amount","contract_status","payment_status",
      "total_amount","paid_amount","remaining_amount","notes","order_number"
    ) VALUES
    (t3,'KTR/2026/001','C-10','Lantai 1',CURRENT_DATE, (CURRENT_DATE + INTERVAL '25 days')::date,
      'monthly',4000000,8000000,600000,350000,175000,'active','unpaid',
      5125000,0,5125000,'Kontrak akan segera berakhir','KTR/2026/001');
  END IF;
END $$;
    `.trim(),
  },
  {
    name: "0005_mall_units",
    sql: `
CREATE TABLE IF NOT EXISTS "mall_units" (
  "id" serial PRIMARY KEY NOT NULL,
  "unit_code" text NOT NULL,
  "floor" text NOT NULL DEFAULT '1',
  "zone" text,
  "size_m2" numeric,
  "status" text NOT NULL DEFAULT 'available',
  "position_x" integer NOT NULL DEFAULT 0,
  "position_y" integer NOT NULL DEFAULT 0,
  "width" integer NOT NULL DEFAULT 2,
  "height" integer NOT NULL DEFAULT 2,
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'mall_units' AND indexname = 'mall_units_unit_code_unique'
  ) THEN
    CREATE UNIQUE INDEX mall_units_unit_code_unique ON "mall_units" ("unit_code");
  END IF;
END $$;
    `.trim(),
  },
  {
    name: "0004_tenant_invoices",
    sql: `
CREATE TABLE IF NOT EXISTS "tenant_invoices" (
  "id" serial PRIMARY KEY NOT NULL,
  "invoice_number" text NOT NULL UNIQUE,
  "tenant_id" integer NOT NULL,
  "booking_id" integer,
  "unit_code" text,
  "period_start" date,
  "period_end" date,
  "due_date" date,
  "rent_amount" numeric NOT NULL DEFAULT '0',
  "service_charge_amount" numeric NOT NULL DEFAULT '0',
  "electricity_charge_amount" numeric NOT NULL DEFAULT '0',
  "water_charge_amount" numeric NOT NULL DEFAULT '0',
  "other_charge_amount" numeric NOT NULL DEFAULT '0',
  "discount_amount" numeric NOT NULL DEFAULT '0',
  "penalty_amount" numeric NOT NULL DEFAULT '0',
  "subtotal" numeric NOT NULL DEFAULT '0',
  "tax_amount" numeric NOT NULL DEFAULT '0',
  "total_amount" numeric NOT NULL DEFAULT '0',
  "paid_amount" numeric NOT NULL DEFAULT '0',
  "outstanding_amount" numeric NOT NULL DEFAULT '0',
  "status" text NOT NULL DEFAULT 'draft',
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_invoices' AND column_name='booking_id') THEN
    ALTER TABLE "tenant_invoices" ADD COLUMN "booking_id" integer;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_invoices' AND column_name='unit_code') THEN
    ALTER TABLE "tenant_invoices" ADD COLUMN "unit_code" text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_invoices' AND column_name='period_start') THEN
    ALTER TABLE "tenant_invoices" ADD COLUMN "period_start" date;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_invoices' AND column_name='period_end') THEN
    ALTER TABLE "tenant_invoices" ADD COLUMN "period_end" date;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_invoices' AND column_name='rent_amount') THEN
    ALTER TABLE "tenant_invoices" ADD COLUMN "rent_amount" numeric NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_invoices' AND column_name='service_charge_amount') THEN
    ALTER TABLE "tenant_invoices" ADD COLUMN "service_charge_amount" numeric NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_invoices' AND column_name='electricity_charge_amount') THEN
    ALTER TABLE "tenant_invoices" ADD COLUMN "electricity_charge_amount" numeric NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_invoices' AND column_name='water_charge_amount') THEN
    ALTER TABLE "tenant_invoices" ADD COLUMN "water_charge_amount" numeric NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_invoices' AND column_name='other_charge_amount') THEN
    ALTER TABLE "tenant_invoices" ADD COLUMN "other_charge_amount" numeric NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_invoices' AND column_name='discount_amount') THEN
    ALTER TABLE "tenant_invoices" ADD COLUMN "discount_amount" numeric NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_invoices' AND column_name='penalty_amount') THEN
    ALTER TABLE "tenant_invoices" ADD COLUMN "penalty_amount" numeric NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_invoices' AND column_name='subtotal') THEN
    ALTER TABLE "tenant_invoices" ADD COLUMN "subtotal" numeric NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_invoices' AND column_name='paid_amount') THEN
    ALTER TABLE "tenant_invoices" ADD COLUMN "paid_amount" numeric NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_invoices' AND column_name='outstanding_amount') THEN
    ALTER TABLE "tenant_invoices" ADD COLUMN "outstanding_amount" numeric NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'tenant_invoices_tenant_id_tenants_id_fk'
  ) THEN
    BEGIN
      ALTER TABLE "tenant_invoices"
        ADD CONSTRAINT "tenant_invoices_tenant_id_tenants_id_fk"
        FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE no action ON UPDATE no action;
    EXCEPTION WHEN others THEN NULL;
    END;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'tenant_invoices_booking_id_tenant_bookings_id_fk'
  ) THEN
    BEGIN
      ALTER TABLE "tenant_invoices"
        ADD CONSTRAINT "tenant_invoices_booking_id_tenant_bookings_id_fk"
        FOREIGN KEY ("booking_id") REFERENCES "tenant_bookings"("id") ON DELETE no action ON UPDATE no action;
    EXCEPTION WHEN others THEN NULL;
    END;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_payments' AND column_name='invoice_id') THEN
    ALTER TABLE "tenant_payments" ADD COLUMN "invoice_id" integer;
  END IF;
END $$;

DO $$
DECLARE
  has_bookings boolean;
  has_our_invoices boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM tenant_bookings LIMIT 1) INTO has_bookings;
  SELECT EXISTS(SELECT 1 FROM tenant_invoices WHERE invoice_number LIKE 'INV-TENANT/%' LIMIT 1) INTO has_our_invoices;
  IF has_bookings AND NOT has_our_invoices THEN
    EXECUTE $dyn$
      INSERT INTO tenant_invoices (
        invoice_number, tenant_id, booking_id, unit_code,
        period_start, period_end, due_date,
        rent_amount, service_charge_amount, electricity_charge_amount, water_charge_amount,
        other_charge_amount, discount_amount, penalty_amount,
        subtotal, tax_amount, total_amount, paid_amount, outstanding_amount, status, notes
      )
      SELECT
        'INV-TENANT/202506/00001',
        tb.tenant_id,
        tb.id,
        tb.unit_code,
        '2025-06-01'::date,
        '2025-06-30'::date,
        '2025-06-10'::date,
        COALESCE(tb.rent_amount, 0),
        COALESCE(tb.service_charge_amount, 0),
        COALESCE(tb.electricity_charge_amount, 0),
        COALESCE(tb.water_charge_amount, 0),
        0, 0, 0,
        COALESCE(tb.rent_amount, 0),
        0,
        COALESCE(tb.rent_amount, 0),
        COALESCE(tb.rent_amount, 0),
        0,
        'paid',
        'Invoice Juni 2025 - lunas'
      FROM tenant_bookings tb
      ORDER BY tb.id LIMIT 1
      ON CONFLICT (invoice_number) DO NOTHING
    $dyn$;
  END IF;
END $$;
    `.trim(),
  },
  {
    name: "0005_pos_kasir_upgrade",
    sql: `
CREATE TABLE IF NOT EXISTS "cashier_shifts" (
  "id" serial PRIMARY KEY NOT NULL,
  "cashier_name" text NOT NULL,
  "cashier_id" integer,
  "opened_at" timestamptz NOT NULL DEFAULT now(),
  "closed_at" timestamptz,
  "expected_cash" numeric NOT NULL DEFAULT '0',
  "actual_cash" numeric,
  "cash_difference" numeric,
  "notes" text,
  "status" text NOT NULL DEFAULT 'open',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_payments' AND column_name='is_voided') THEN
    ALTER TABLE "tenant_payments" ADD COLUMN "is_voided" boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_payments' AND column_name='voided_at') THEN
    ALTER TABLE "tenant_payments" ADD COLUMN "voided_at" timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_payments' AND column_name='void_reason') THEN
    ALTER TABLE "tenant_payments" ADD COLUMN "void_reason" text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_payments' AND column_name='voided_by') THEN
    ALTER TABLE "tenant_payments" ADD COLUMN "voided_by" text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_payments' AND column_name='reference_number') THEN
    ALTER TABLE "tenant_payments" ADD COLUMN "reference_number" text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_payments' AND column_name='proof_url') THEN
    ALTER TABLE "tenant_payments" ADD COLUMN "proof_url" text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_payments' AND column_name='shift_id') THEN
    ALTER TABLE "tenant_payments" ADD COLUMN "shift_id" integer;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_payments' AND column_name='refund_amount') THEN
    ALTER TABLE "tenant_payments" ADD COLUMN "refund_amount" numeric NOT NULL DEFAULT '0';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_payments' AND column_name='refund_reason') THEN
    ALTER TABLE "tenant_payments" ADD COLUMN "refund_reason" text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_payments' AND column_name='refund_status') THEN
    ALTER TABLE "tenant_payments" ADD COLUMN "refund_status" text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_payments' AND column_name='receipt_number') THEN
    ALTER TABLE "tenant_payments" ADD COLUMN "receipt_number" text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_payments' AND column_name='payment_method') THEN
    ALTER TABLE "tenant_payments" ADD COLUMN "payment_method" text NOT NULL DEFAULT 'tunai';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_payments' AND column_name='payment_status') THEN
    ALTER TABLE "tenant_payments" ADD COLUMN "payment_status" text NOT NULL DEFAULT 'PAID';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_payments' AND column_name='booking_id') THEN
    ALTER TABLE "tenant_payments" ADD COLUMN "booking_id" integer;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_payments' AND column_name='tenant_id') THEN
    ALTER TABLE "tenant_payments" ADD COLUMN "tenant_id" integer;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_payments' AND column_name='discount_amount') THEN
    ALTER TABLE "tenant_payments" ADD COLUMN "discount_amount" numeric NOT NULL DEFAULT '0';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_payments' AND column_name='penalty_amount') THEN
    ALTER TABLE "tenant_payments" ADD COLUMN "penalty_amount" numeric NOT NULL DEFAULT '0';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_payments' AND column_name='paid_at') THEN
    ALTER TABLE "tenant_payments" ADD COLUMN "paid_at" timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_payments' AND column_name='invoice_id') THEN
    ALTER TABLE "tenant_payments" ADD COLUMN "invoice_id" integer;
  END IF;
END $$;
    `.trim(),
  },
  {
    name: "0006_audit_logs",
    sql: `
CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer,
  "user_email" text,
  "user_name" text,
  "action" text NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" text,
  "before_data" jsonb,
  "after_data" jsonb,
  "ip_address" text,
  "user_agent" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'audit_logs' AND indexname = 'audit_logs_action_idx'
  ) THEN
    CREATE INDEX audit_logs_action_idx ON "audit_logs" ("action");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'audit_logs' AND indexname = 'audit_logs_entity_idx'
  ) THEN
    CREATE INDEX audit_logs_entity_idx ON "audit_logs" ("entity_type", "entity_id");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'audit_logs' AND indexname = 'audit_logs_created_idx'
  ) THEN
    CREATE INDEX audit_logs_created_idx ON "audit_logs" ("created_at" DESC);
  END IF;
END $$;
    `.trim(),
  },
  {
    name: "0010_tenant_payments_nullable_booking_id",
    sql: `
ALTER TABLE "tenant_payments" ALTER COLUMN "tenant_booking_id" DROP NOT NULL;
    `.trim(),
  },
  {
    name: "0011_multi_site",
    sql: `
CREATE TABLE IF NOT EXISTS "mall_sites" (
  "id" serial PRIMARY KEY NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "type" text NOT NULL DEFAULT 'mall_tenant',
  "address" text,
  "status" text NOT NULL DEFAULT 'active',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE tablename = 'mall_sites' AND indexname = 'mall_sites_code_unique'
  ) THEN
    CREATE UNIQUE INDEX mall_sites_code_unique ON "mall_sites" ("code");
  END IF;
END $$;

INSERT INTO "mall_sites" ("code", "name", "type", "status")
VALUES ('TOD_M1_BANDARA', 'TOD M1 Bandara', 'mall_tenant', 'active')
ON CONFLICT DO NOTHING;

INSERT INTO "mall_sites" ("code", "name", "type", "status")
VALUES ('SPORT_CENTER_BANDARA', 'Sport Center Bandara', 'sport_center', 'active')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS "user_site_access" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "site_id" integer NOT NULL,
  "role" text NOT NULL DEFAULT 'admin',
  "created_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE tablename = 'user_site_access' AND indexname = 'user_site_access_user_site_unique'
  ) THEN
    CREATE UNIQUE INDEX user_site_access_user_site_unique ON "user_site_access" ("user_id", "site_id");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenants' AND column_name='site_id') THEN
    ALTER TABLE "tenants" ADD COLUMN "site_id" integer;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_bookings' AND column_name='site_id') THEN
    ALTER TABLE "tenant_bookings" ADD COLUMN "site_id" integer;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_invoices' AND column_name='site_id') THEN
    ALTER TABLE "tenant_invoices" ADD COLUMN "site_id" integer;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_payments' AND column_name='site_id') THEN
    ALTER TABLE "tenant_payments" ADD COLUMN "site_id" integer;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='mall_units' AND column_name='site_id') THEN
    ALTER TABLE "mall_units" ADD COLUMN "site_id" integer;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='audit_logs' AND column_name='site_id') THEN
    ALTER TABLE "audit_logs" ADD COLUMN "site_id" integer;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cashier_shifts' AND column_name='site_id') THEN
    ALTER TABLE "cashier_shifts" ADD COLUMN "site_id" integer;
  END IF;
END $$;

UPDATE "tenants" SET "site_id" = (SELECT id FROM mall_sites WHERE code = 'TOD_M1_BANDARA') WHERE "site_id" IS NULL;
UPDATE "tenant_bookings" SET "site_id" = (SELECT id FROM mall_sites WHERE code = 'TOD_M1_BANDARA') WHERE "site_id" IS NULL;
UPDATE "tenant_invoices" SET "site_id" = (SELECT id FROM mall_sites WHERE code = 'TOD_M1_BANDARA') WHERE "site_id" IS NULL;
UPDATE "tenant_payments" SET "site_id" = (SELECT id FROM mall_sites WHERE code = 'TOD_M1_BANDARA') WHERE "site_id" IS NULL;
UPDATE "mall_units" SET "site_id" = (SELECT id FROM mall_sites WHERE code = 'TOD_M1_BANDARA') WHERE "site_id" IS NULL;
UPDATE "audit_logs" SET "site_id" = (SELECT id FROM mall_sites WHERE code = 'TOD_M1_BANDARA') WHERE "site_id" IS NULL;
UPDATE "cashier_shifts" SET "site_id" = (SELECT id FROM mall_sites WHERE code = 'TOD_M1_BANDARA') WHERE "site_id" IS NULL;

ALTER TABLE "tenants" ALTER COLUMN "site_id" SET NOT NULL;
ALTER TABLE "tenant_bookings" ALTER COLUMN "site_id" SET NOT NULL;
ALTER TABLE "tenant_invoices" ALTER COLUMN "site_id" SET NOT NULL;
ALTER TABLE "tenant_payments" ALTER COLUMN "site_id" SET NOT NULL;
ALTER TABLE "mall_units" ALTER COLUMN "site_id" SET NOT NULL;
    `.trim(),
  },
  {
    name: "0012_audit_logs_site_code",
    sql: `
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='audit_logs' AND column_name='site_code') THEN
    ALTER TABLE "audit_logs" ADD COLUMN "site_code" text;
  END IF;
END $$;
    `.trim(),
  },
  {
    name: "0013_whatsapp_tenant_user",
    sql: `
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='phone_number') THEN
    ALTER TABLE "users" ADD COLUMN "phone_number" text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='phone_verified_at') THEN
    ALTER TABLE "users" ADD COLUMN "phone_verified_at" timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='status') THEN
    ALTER TABLE "users" ADD COLUMN "status" text NOT NULL DEFAULT 'active';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='last_login_at') THEN
    ALTER TABLE "users" ADD COLUMN "last_login_at" timestamptz;
  END IF;
END $$;

ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;

DO $$ BEGIN
  IF (SELECT column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'id') IS NULL THEN
    ALTER TABLE "users" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "tenant_user_access" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "tenant_id" integer NOT NULL REFERENCES "tenants"("id"),
  "site_id" integer NOT NULL REFERENCES "mall_sites"("id"),
  "access_level" text NOT NULL DEFAULT 'viewer',
  "status" text NOT NULL DEFAULT 'active',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE tablename = 'tenant_user_access' AND indexname = 'tenant_user_access_user_tenant_site_idx'
  ) THEN
    CREATE INDEX tenant_user_access_user_tenant_site_idx ON "tenant_user_access" ("user_id", "tenant_id", "site_id");
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "otp_tokens" (
  "id" serial PRIMARY KEY NOT NULL,
  "phone_number" text NOT NULL,
  "otp_hash" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "attempts" integer NOT NULL DEFAULT 0,
  "used_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE tablename = 'otp_tokens' AND indexname = 'otp_tokens_phone_idx'
  ) THEN
    CREATE INDEX otp_tokens_phone_idx ON "otp_tokens" ("phone_number");
  END IF;
END $$;
    `.trim(),
  },
  {
    name: "0014_users_avatar_url",
    sql: `
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='avatar_url') THEN
    ALTER TABLE "users" ADD COLUMN "avatar_url" text;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_bookings' AND column_name='order_number' AND column_default IS NULL) THEN
    ALTER TABLE "tenant_bookings" ALTER COLUMN "order_number" SET DEFAULT '';
  END IF;
END $$;
    `.trim(),
  },
  {
    name: "0016_payment_proof_approval",
    sql: `
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_invoices' AND column_name='payment_token') THEN
    ALTER TABLE "tenant_invoices" ADD COLUMN "payment_token" text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_invoices' AND column_name='last_overdue_reminder_at') THEN
    ALTER TABLE "tenant_invoices" ADD COLUMN "last_overdue_reminder_at" timestamptz;
  END IF;
END $$;

UPDATE "tenant_invoices" SET payment_token = gen_random_uuid()::text WHERE payment_token IS NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='tenant_invoices' AND column_name='payment_token'
    AND column_default IS NOT NULL
  ) THEN
    ALTER TABLE "tenant_invoices" ALTER COLUMN "payment_token" SET DEFAULT gen_random_uuid()::text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE tablename = 'tenant_invoices' AND indexname = 'tenant_invoices_payment_token_uq'
  ) THEN
    CREATE UNIQUE INDEX tenant_invoices_payment_token_uq ON "tenant_invoices" ("payment_token") WHERE payment_token IS NOT NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_payments' AND column_name='approval_status') THEN
    ALTER TABLE "tenant_payments" ADD COLUMN "approval_status" text NOT NULL DEFAULT 'approved';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_payments' AND column_name='rejection_reason') THEN
    ALTER TABLE "tenant_payments" ADD COLUMN "rejection_reason" text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_payments' AND column_name='approved_by') THEN
    ALTER TABLE "tenant_payments" ADD COLUMN "approved_by" text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_payments' AND column_name='approved_at') THEN
    ALTER TABLE "tenant_payments" ADD COLUMN "approved_at" timestamptz;
  END IF;
END $$;
    `.trim(),
  },
  {
    name: "0015_role_enum_to_text",
    sql: `
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'role'
      AND udt_name = 'user_role'
  ) THEN
    ALTER TABLE "users" ALTER COLUMN "role" TYPE text USING "role"::text;
  END IF;
END $$;
    `.trim(),
  },
  {
    name: "0017_cashier_shifts_columns",
    sql: `
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cashier_shifts' AND column_name='cashier_id') THEN
    ALTER TABLE "cashier_shifts" ADD COLUMN "cashier_id" integer;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cashier_shifts' AND column_name='opened_at') THEN
    ALTER TABLE "cashier_shifts" ADD COLUMN "opened_at" timestamptz NOT NULL DEFAULT now();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cashier_shifts' AND column_name='site_id') THEN
    ALTER TABLE "cashier_shifts" ADD COLUMN "site_id" integer;
  END IF;
END $$;
    `.trim(),
  },
  {
    name: "0019_seed_mall_units",
    sql: `
DO $$
DECLARE
  tod_id int;
  sc_id int;
BEGIN
  -- Cari site_id secara dinamis berdasarkan code (tidak hardcode angka)
  SELECT id INTO tod_id FROM mall_sites WHERE code = 'TOD_M1_BANDARA' LIMIT 1;
  SELECT id INTO sc_id FROM mall_sites WHERE code = 'SPORT_CENTER_BANDARA' LIMIT 1;

  -- Seed unit TOD M1 jika belum ada
  IF tod_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM mall_units WHERE site_id = tod_id LIMIT 1) THEN
    INSERT INTO mall_units (unit_code, floor, zone, size_m2, status, position_x, position_y, width, height, site_id) VALUES
    ('T-001', '1', 'Zona A', 24, 'occupied',  0, 0, 2, 2, tod_id),
    ('T-002', '1', 'Zona A', 24, 'occupied',  2, 0, 2, 2, tod_id),
    ('T-003', '1', 'Zona A', 18, 'occupied',  4, 0, 2, 2, tod_id),
    ('T-004', '1', 'Zona B', 30, 'occupied',  0, 2, 2, 2, tod_id),
    ('T-005', '1', 'Zona B', 20, 'occupied',  2, 2, 2, 2, tod_id),
    ('T-006', '1', 'Zona A', 18, 'occupied',  4, 2, 2, 2, tod_id),
    ('T-007', '1', 'Zona B', 20, 'occupied',  6, 2, 2, 2, tod_id),
    ('T-008', '1', 'Zona C', 36, 'occupied',  0, 4, 2, 2, tod_id),
    ('T-009', '1', 'Zona A', 18, 'occupied',  2, 4, 2, 2, tod_id),
    ('T-010', '1', 'Zona A', 16, 'occupied',  4, 4, 2, 2, tod_id),
    ('T-011', '1', 'Zona B', 20, 'occupied',  6, 4, 2, 2, tod_id),
    ('T-012', '1', 'Zona A', 18, 'occupied',  0, 6, 2, 2, tod_id),
    ('T-013', '1', 'Zona B', 24, 'available', 2, 6, 2, 2, tod_id),
    ('T-014', '1', 'Zona C', 30, 'available', 4, 6, 2, 2, tod_id),
    ('T-015', '1', 'Zona C', 20, 'available', 6, 6, 2, 2, tod_id),
    ('T-016', '1', 'Zona C', 20, 'available', 8, 6, 2, 2, tod_id);
  END IF;

  -- Seed unit Sport Center jika belum ada
  IF sc_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM mall_units WHERE site_id = sc_id AND unit_code = 'SC-01' LIMIT 1) THEN
    INSERT INTO mall_units (unit_code, floor, zone, size_m2, status, position_x, position_y, width, height, site_id) VALUES
    ('SC-01', '1', 'Lapangan', 200, 'occupied',  0, 0, 4, 4, sc_id),
    ('SC-02', '1', 'Lapangan', 200, 'available', 4, 0, 4, 4, sc_id),
    ('SC-03', '1', 'Lapangan', 200, 'available', 8, 0, 4, 4, sc_id),
    ('SC-04', '1', 'Fasilitas', 120, 'available', 0, 4, 4, 4, sc_id),
    ('SC-05', '1', 'Fasilitas', 80,  'available', 4, 4, 2, 2, sc_id),
    ('SC-06', '1', 'Fasilitas', 80,  'available', 6, 4, 2, 2, sc_id),
    ('SC-07', '1', 'Tenant',    40,  'available', 8, 4, 2, 2, sc_id),
    ('SC-08', '1', 'Tenant',    40,  'available', 8, 6, 2, 2, sc_id);
  END IF;
END $$;
    `.trim(),
  },
  {
    name: "0023_add_sport_center_site",
    sql: `
DO $$ DECLARE
  sc_id int;
  t1 int; t2 int; t3 int; t4 int; t5 int; t6 int; t7 int; t8 int;
BEGIN
  -- 1. Insert Sport Center ke mall_sites jika belum ada
  INSERT INTO mall_sites (code, name, type, address, status)
  VALUES ('SPORT_CENTER_BANDARA', 'Sport Center', 'mall_tenant', 'Sport Center Bandara', 'active')
  ON CONFLICT (code) DO NOTHING;

  SELECT id INTO sc_id FROM mall_sites WHERE code = 'SPORT_CENTER_BANDARA';

  -- 2. Hapus SC units orphan (site_id != sc_id) lalu re-seed
  DELETE FROM mall_units WHERE unit_code LIKE 'SC-%' AND site_id != sc_id;

  IF NOT EXISTS (SELECT 1 FROM mall_units WHERE site_id = sc_id AND unit_code = 'SC-01') THEN
    INSERT INTO mall_units (unit_code, floor, zone, size_m2, status, position_x, position_y, width, height, site_id) VALUES
    ('SC-01', '1', 'Lapangan', 200, 'occupied',  0, 0, 4, 4, sc_id),
    ('SC-02', '1', 'Lapangan', 200, 'occupied',  4, 0, 4, 4, sc_id),
    ('SC-03', '1', 'Lapangan', 200, 'occupied',  8, 0, 4, 4, sc_id),
    ('SC-04', '1', 'Fasilitas', 120, 'occupied', 0, 4, 4, 4, sc_id),
    ('SC-05', '1', 'Fasilitas',  80, 'occupied', 4, 4, 2, 2, sc_id),
    ('SC-06', '1', 'Fasilitas',  80, 'occupied', 6, 4, 2, 2, sc_id),
    ('SC-07', '1', 'Tenant',     40, 'occupied', 8, 4, 2, 2, sc_id),
    ('SC-08', '1', 'Tenant',     40, 'occupied', 8, 6, 2, 2, sc_id);
  END IF;

  -- 3. Hapus tenant SC orphan (site_id != sc_id) lalu re-seed
  DELETE FROM tenants
  WHERE site_id != sc_id
    AND booth_number IN ('SC-01','SC-02','SC-03','SC-04','SC-05','SC-06','SC-07','SC-08');

  -- 4. Insert tenant Sport Center jika belum ada
  IF NOT EXISTS (SELECT 1 FROM tenants WHERE site_id = sc_id AND booth_number = 'SC-01') THEN
    INSERT INTO tenants (business_name, owner_name, email, phone, category, booth_number, area_name, status, site_id, address)
    VALUES ('Lapangan Futsal Pro', 'Deni Kusuma', 'futsal@sportcenter.id', '081211110001', 'Olahraga', 'SC-01', 'Lapangan', 'active', sc_id, 'Sport Center Bandara, Lt.1')
    RETURNING id INTO t1;

    INSERT INTO tenants (business_name, owner_name, email, phone, category, booth_number, area_name, status, site_id, address)
    VALUES ('GOR Badminton Sport', 'Rini Handayani', 'badminton@sportcenter.id', '081211110002', 'Olahraga', 'SC-02', 'Lapangan', 'active', sc_id, 'Sport Center Bandara, Lt.1')
    RETURNING id INTO t2;

    INSERT INTO tenants (business_name, owner_name, email, phone, category, booth_number, area_name, status, site_id, address)
    VALUES ('Arena Basket Bandara', 'Yusuf Hakim', 'basket@sportcenter.id', '081211110003', 'Olahraga', 'SC-03', 'Lapangan', 'active', sc_id, 'Sport Center Bandara, Lt.1')
    RETURNING id INTO t3;

    INSERT INTO tenants (business_name, owner_name, email, phone, category, booth_number, area_name, status, site_id, address)
    VALUES ('Prime Fitness Center', 'Anita Wahyuni', 'fitness@sportcenter.id', '081211110004', 'Olahraga', 'SC-04', 'Fasilitas', 'active', sc_id, 'Sport Center Bandara, Lt.1')
    RETURNING id INTO t4;

    INSERT INTO tenants (business_name, owner_name, email, phone, category, booth_number, area_name, status, site_id, address)
    VALUES ('Aqua Swim & Pool', 'Bowo Setiawan', 'aqua@sportcenter.id', '081211110005', 'Olahraga', 'SC-05', 'Fasilitas', 'active', sc_id, 'Sport Center Bandara, Lt.1')
    RETURNING id INTO t5;

    INSERT INTO tenants (business_name, owner_name, email, phone, category, booth_number, area_name, status, site_id, address)
    VALUES ('Sport Cafe & Resto', 'Linda Sari', 'cafe@sportcenter.id', '081211110006', 'F&B', 'SC-06', 'Fasilitas', 'active', sc_id, 'Sport Center Bandara, Lt.1')
    RETURNING id INTO t6;

    INSERT INTO tenants (business_name, owner_name, email, phone, category, booth_number, area_name, status, site_id, address)
    VALUES ('Sport Kingdom Store', 'Hendra Putra', 'store@sportcenter.id', '081211110007', 'Retail', 'SC-07', 'Tenant', 'active', sc_id, 'Sport Center Bandara, Lt.1')
    RETURNING id INTO t7;

    INSERT INTO tenants (business_name, owner_name, email, phone, category, booth_number, area_name, status, site_id, address)
    VALUES ('Warung Atlet', 'Siti Rahayu', 'warung@sportcenter.id', '081211110008', 'F&B', 'SC-08', 'Tenant', 'active', sc_id, 'Sport Center Bandara, Lt.1')
    RETURNING id INTO t8;

    -- Booking untuk setiap tenant
    INSERT INTO tenant_bookings
      (tenant_id, unit_code, floor, start_date, end_date, rent_amount, deposit_amount,
       status, booking_status, contract_status, payment_status, site_id,
       period_label, booking_type, billing_cycle, order_number, contract_number)
    VALUES
      (t1,'SC-01','1','2024-01-01','2026-12-31',8000000,16000000,'aktif','active','active','lunas',sc_id,'Jan 2024 - Des 2026','sewa','bulanan','SC-ORD-2024-001','SC-KTR-2024-001'),
      (t2,'SC-02','1','2024-03-01','2027-02-28',8000000,16000000,'aktif','active','active','lunas',sc_id,'Mar 2024 - Feb 2027','sewa','bulanan','SC-ORD-2024-002','SC-KTR-2024-002'),
      (t3,'SC-03','1','2023-07-01','2025-06-30',8000000,16000000,'aktif','active','active','lunas',sc_id,'Jul 2023 - Jun 2025','sewa','bulanan','SC-ORD-2023-001','SC-KTR-2023-001'),
      (t4,'SC-04','1','2024-06-01','2027-05-31',6000000,12000000,'aktif','active','active','lunas',sc_id,'Jun 2024 - Mei 2027','sewa','bulanan','SC-ORD-2024-003','SC-KTR-2024-003'),
      (t5,'SC-05','1','2025-01-01','2027-12-31',4500000, 9000000,'aktif','active','active','lunas',sc_id,'Jan 2025 - Des 2027','sewa','bulanan','SC-ORD-2025-001','SC-KTR-2025-001'),
      (t6,'SC-06','1','2024-09-01','2026-08-31',4500000, 9000000,'aktif','active','active','lunas',sc_id,'Sep 2024 - Agu 2026','sewa','bulanan','SC-ORD-2024-004','SC-KTR-2024-004'),
      (t7,'SC-07','1','2025-03-01','2027-02-28',2500000, 5000000,'aktif','active','active','lunas',sc_id,'Mar 2025 - Feb 2027','sewa','bulanan','SC-ORD-2025-002','SC-KTR-2025-002'),
      (t8,'SC-08','1','2025-05-01','2027-04-30',2500000, 5000000,'aktif','active','active','lunas',sc_id,'Mei 2025 - Apr 2027','sewa','bulanan','SC-ORD-2025-003','SC-KTR-2025-003');
  END IF;
END $$;
    `.trim(),
  },
  {
    name: "0022_restore_mall_units",
    sql: `
DO $$ BEGIN
  -- Pastikan constraint global unit_code sudah diganti ke (site_id, unit_code)
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'mall_units' AND indexname = 'mall_units_unit_code_unique') THEN
    DROP INDEX "mall_units_unit_code_unique";
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'mall_units' AND indexname = 'mall_units_site_unit_unique') THEN
    CREATE UNIQUE INDEX "mall_units_site_unit_unique" ON "mall_units" ("site_id", "unit_code");
  END IF;
END $$;

-- Restore TOD M1 units (site_id=1) jika belum ada
INSERT INTO mall_units (unit_code, floor, zone, size_m2, status, position_x, position_y, width, height, site_id) VALUES
('T-001', '1', 'Zona A', 20, 'occupied',  0, 0, 2, 2, 1),
('T-002', '1', 'Zona A', 16, 'occupied',  2, 0, 2, 2, 1),
('T-003', '1', 'Zona A', 14, 'occupied',  4, 0, 2, 2, 1),
('T-004', '1', 'Zona A', 18, 'occupied',  6, 0, 2, 2, 1),
('T-005', '1', 'Zona B', 20, 'occupied',  0, 2, 2, 2, 1),
('T-006', '1', 'Zona B', 16, 'occupied',  2, 2, 2, 2, 1),
('T-007', '1', 'Zona B', 14, 'occupied',  4, 2, 2, 2, 1),
('T-008', '1', 'Zona B', 18, 'available', 6, 2, 2, 2, 1),
('T-009', '1', 'Zona A', 20, 'occupied',  0, 4, 2, 2, 1),
('T-010', '1', 'Zona A', 16, 'occupied',  4, 4, 2, 2, 1),
('T-011', '1', 'Zona B', 20, 'occupied',  6, 4, 2, 2, 1),
('T-012', '1', 'Zona A', 18, 'occupied',  0, 6, 2, 2, 1),
('T-013', '1', 'Zona B', 24, 'available', 2, 6, 2, 2, 1),
('T-014', '1', 'Zona C', 30, 'available', 4, 6, 2, 2, 1),
('T-015', '1', 'Zona C', 20, 'available', 6, 6, 2, 2, 1),
('T-016', '1', 'Zona C', 20, 'available', 8, 6, 2, 2, 1)
ON CONFLICT (site_id, unit_code) DO NOTHING;

-- Restore Sport Center units (site_id=3) jika belum ada
INSERT INTO mall_units (unit_code, floor, zone, size_m2, status, position_x, position_y, width, height, site_id) VALUES
('SC-01', '1', 'Lapangan', 200, 'occupied',  0, 0, 4, 4, 3),
('SC-02', '1', 'Lapangan', 200, 'occupied',  4, 0, 4, 4, 3),
('SC-03', '1', 'Lapangan', 200, 'occupied',  8, 0, 4, 4, 3),
('SC-04', '1', 'Fasilitas', 120, 'occupied', 0, 4, 4, 4, 3),
('SC-05', '1', 'Fasilitas',  80, 'occupied', 4, 4, 2, 2, 3),
('SC-06', '1', 'Fasilitas',  80, 'occupied', 6, 4, 2, 2, 3),
('SC-07', '1', 'Tenant',     40, 'occupied', 8, 4, 2, 2, 3),
('SC-08', '1', 'Tenant',     40, 'occupied', 8, 6, 2, 2, 3)
ON CONFLICT (site_id, unit_code) DO NOTHING;
    `.trim(),
  },
  {
    name: "0021_sport_center_reseed",
    sql: `
DO $$ DECLARE
  t1 int; t2 int; t3 int; t4 int; t5 int; t6 int; t7 int; t8 int;
BEGIN
  -- 1. Hapus unit test/duplikat di Sport Center (bukan SC-0X pattern)
  DELETE FROM mall_units
  WHERE site_id = 3
    AND unit_code NOT LIKE 'SC-%';

  -- 2. Seed unit SC-01-SC-08 jika belum ada
  IF NOT EXISTS (SELECT 1 FROM mall_units WHERE site_id = 3 AND unit_code = 'SC-01') THEN
    INSERT INTO mall_units (unit_code, floor, zone, size_m2, status, position_x, position_y, width, height, site_id) VALUES
    ('SC-01', '1', 'Lapangan', 200, 'occupied',  0, 0, 4, 4, 3),
    ('SC-02', '1', 'Lapangan', 200, 'occupied',  4, 0, 4, 4, 3),
    ('SC-03', '1', 'Lapangan', 200, 'occupied',  8, 0, 4, 4, 3),
    ('SC-04', '1', 'Fasilitas', 120, 'occupied', 0, 4, 4, 4, 3),
    ('SC-05', '1', 'Fasilitas',  80, 'occupied', 4, 4, 2, 2, 3),
    ('SC-06', '1', 'Fasilitas',  80, 'occupied', 6, 4, 2, 2, 3),
    ('SC-07', '1', 'Tenant',     40, 'occupied', 8, 4, 2, 2, 3),
    ('SC-08', '1', 'Tenant',     40, 'occupied', 8, 6, 2, 2, 3);
  ELSE
    -- Unit sudah ada, pastikan semua occupied
    UPDATE mall_units SET status = 'occupied' WHERE site_id = 3 AND unit_code LIKE 'SC-%';
  END IF;

  -- 3. Hapus tenant duplikat/test di Sport Center jika ada
  DELETE FROM tenants
  WHERE site_id = 3
    AND booth_number NOT IN ('SC-01','SC-02','SC-03','SC-04','SC-05','SC-06','SC-07','SC-08');

  -- 4. Insert tenant Sport Center jika belum ada per booth
  IF NOT EXISTS (SELECT 1 FROM tenants WHERE site_id = 3 AND booth_number = 'SC-01') THEN
    INSERT INTO tenants (business_name, owner_name, email, phone, category, booth_number, area_name, status, site_id, address)
    VALUES ('Lapangan Futsal Pro', 'Deni Kusuma', 'futsal@sportcenter.id', '081211110001', 'Olahraga', 'SC-01', 'Lapangan', 'active', 3, 'Sport Center Bandara, Lt.1')
    RETURNING id INTO t1;

    INSERT INTO tenants (business_name, owner_name, email, phone, category, booth_number, area_name, status, site_id, address)
    VALUES ('GOR Badminton Sport', 'Rini Handayani', 'badminton@sportcenter.id', '081211110002', 'Olahraga', 'SC-02', 'Lapangan', 'active', 3, 'Sport Center Bandara, Lt.1')
    RETURNING id INTO t2;

    INSERT INTO tenants (business_name, owner_name, email, phone, category, booth_number, area_name, status, site_id, address)
    VALUES ('Arena Basket Bandara', 'Yusuf Hakim', 'basket@sportcenter.id', '081211110003', 'Olahraga', 'SC-03', 'Lapangan', 'active', 3, 'Sport Center Bandara, Lt.1')
    RETURNING id INTO t3;

    INSERT INTO tenants (business_name, owner_name, email, phone, category, booth_number, area_name, status, site_id, address)
    VALUES ('Prime Fitness Center', 'Anita Wahyuni', 'fitness@sportcenter.id', '081211110004', 'Olahraga', 'SC-04', 'Fasilitas', 'active', 3, 'Sport Center Bandara, Lt.1')
    RETURNING id INTO t4;

    INSERT INTO tenants (business_name, owner_name, email, phone, category, booth_number, area_name, status, site_id, address)
    VALUES ('Aqua Swim & Pool', 'Bowo Setiawan', 'aqua@sportcenter.id', '081211110005', 'Olahraga', 'SC-05', 'Fasilitas', 'active', 3, 'Sport Center Bandara, Lt.1')
    RETURNING id INTO t5;

    INSERT INTO tenants (business_name, owner_name, email, phone, category, booth_number, area_name, status, site_id, address)
    VALUES ('Sport Cafe & Resto', 'Linda Sari', 'cafe@sportcenter.id', '081211110006', 'F&B', 'SC-06', 'Fasilitas', 'active', 3, 'Sport Center Bandara, Lt.1')
    RETURNING id INTO t6;

    INSERT INTO tenants (business_name, owner_name, email, phone, category, booth_number, area_name, status, site_id, address)
    VALUES ('Sport Kingdom Store', 'Hendra Putra', 'store@sportcenter.id', '081211110007', 'Retail', 'SC-07', 'Tenant', 'active', 3, 'Sport Center Bandara, Lt.1')
    RETURNING id INTO t7;

    INSERT INTO tenants (business_name, owner_name, email, phone, category, booth_number, area_name, status, site_id, address)
    VALUES ('Warung Atlet', 'Siti Rahayu', 'warung@sportcenter.id', '081211110008', 'F&B', 'SC-08', 'Tenant', 'active', 3, 'Sport Center Bandara, Lt.1')
    RETURNING id INTO t8;

    -- Booking untuk setiap tenant (dengan order_number unik)
    INSERT INTO tenant_bookings
      (tenant_id, unit_code, floor, start_date, end_date, rent_amount, deposit_amount,
       status, booking_status, contract_status, payment_status, site_id,
       period_label, booking_type, billing_cycle, order_number, contract_number)
    VALUES
      (t1,'SC-01','1','2024-01-01','2026-12-31',8000000,16000000,'aktif','active','active','lunas',3,'Jan 2024 - Des 2026','sewa','bulanan','SC-ORD-2024-001','SC-KTR-2024-001'),
      (t2,'SC-02','1','2024-03-01','2027-02-28',8000000,16000000,'aktif','active','active','lunas',3,'Mar 2024 - Feb 2027','sewa','bulanan','SC-ORD-2024-002','SC-KTR-2024-002'),
      (t3,'SC-03','1','2023-07-01','2025-06-30',8000000,16000000,'aktif','active','active','lunas',3,'Jul 2023 - Jun 2025','sewa','bulanan','SC-ORD-2023-001','SC-KTR-2023-001'),
      (t4,'SC-04','1','2024-06-01','2027-05-31',6000000,12000000,'aktif','active','active','lunas',3,'Jun 2024 - Mei 2027','sewa','bulanan','SC-ORD-2024-003','SC-KTR-2024-003'),
      (t5,'SC-05','1','2025-01-01','2027-12-31',4500000, 9000000,'aktif','active','active','lunas',3,'Jan 2025 - Des 2027','sewa','bulanan','SC-ORD-2025-001','SC-KTR-2025-001'),
      (t6,'SC-06','1','2024-09-01','2026-08-31',4500000, 9000000,'aktif','active','active','lunas',3,'Sep 2024 - Agu 2026','sewa','bulanan','SC-ORD-2024-004','SC-KTR-2024-004'),
      (t7,'SC-07','1','2025-03-01','2027-02-28',2500000, 5000000,'aktif','active','active','lunas',3,'Mar 2025 - Feb 2027','sewa','bulanan','SC-ORD-2025-002','SC-KTR-2025-002'),
      (t8,'SC-08','1','2025-05-01','2027-04-30',2500000, 5000000,'aktif','active','active','lunas',3,'Mei 2025 - Apr 2027','sewa','bulanan','SC-ORD-2025-003','SC-KTR-2025-003');
  END IF;
END $$;
    `.trim(),
  },
  {
    name: "0020_sport_center_tenants",
    sql: `
DO $$ DECLARE
  t1 int; t2 int; t3 int; t4 int; t5 int; t6 int; t7 int; t8 int;
BEGIN
  -- Hanya insert jika belum ada tenant Sport Center
  IF NOT EXISTS (SELECT 1 FROM tenants WHERE site_id = 3 LIMIT 1) THEN

    INSERT INTO tenants (business_name, owner_name, email, phone, category, booth_number, area_name, status, site_id, address)
    VALUES ('Lapangan Futsal Pro',   'Deni Kusuma',    'futsal@sportcenter.id',   '081211110001', 'Olahraga', 'SC-01', 'Lapangan', 'active', 3, 'Sport Center Bandara, Lt.1')
    RETURNING id INTO t1;

    INSERT INTO tenants (business_name, owner_name, email, phone, category, booth_number, area_name, status, site_id, address)
    VALUES ('GOR Badminton Sport',   'Rini Handayani', 'badminton@sportcenter.id','081211110002', 'Olahraga', 'SC-02', 'Lapangan', 'active', 3, 'Sport Center Bandara, Lt.1')
    RETURNING id INTO t2;

    INSERT INTO tenants (business_name, owner_name, email, phone, category, booth_number, area_name, status, site_id, address)
    VALUES ('Arena Basket Bandara',  'Yusuf Hakim',    'basket@sportcenter.id',   '081211110003', 'Olahraga', 'SC-03', 'Lapangan', 'active', 3, 'Sport Center Bandara, Lt.1')
    RETURNING id INTO t3;

    INSERT INTO tenants (business_name, owner_name, email, phone, category, booth_number, area_name, status, site_id, address)
    VALUES ('Prime Fitness Center',  'Anita Wahyuni',  'fitness@sportcenter.id',  '081211110004', 'Olahraga', 'SC-04', 'Fasilitas','active', 3, 'Sport Center Bandara, Lt.1')
    RETURNING id INTO t4;

    INSERT INTO tenants (business_name, owner_name, email, phone, category, booth_number, area_name, status, site_id, address)
    VALUES ('Aqua Swim & Pool',      'Bowo Setiawan',  'aqua@sportcenter.id',     '081211110005', 'Olahraga', 'SC-05', 'Fasilitas','active', 3, 'Sport Center Bandara, Lt.1')
    RETURNING id INTO t5;

    INSERT INTO tenants (business_name, owner_name, email, phone, category, booth_number, area_name, status, site_id, address)
    VALUES ('Sport Cafe & Resto',    'Linda Sari',     'cafe@sportcenter.id',     '081211110006', 'F&B',      'SC-06', 'Fasilitas','active', 3, 'Sport Center Bandara, Lt.1')
    RETURNING id INTO t6;

    INSERT INTO tenants (business_name, owner_name, email, phone, category, booth_number, area_name, status, site_id, address)
    VALUES ('Sport Kingdom Store',   'Hendra Putra',   'store@sportcenter.id',    '081211110007', 'Retail',   'SC-07', 'Tenant',   'active', 3, 'Sport Center Bandara, Lt.1')
    RETURNING id INTO t7;

    INSERT INTO tenants (business_name, owner_name, email, phone, category, booth_number, area_name, status, site_id, address)
    VALUES ('Warung Atlet',          'Siti Rahayu',    'warung@sportcenter.id',   '081211110008', 'F&B',      'SC-08', 'Tenant',   'active', 3, 'Sport Center Bandara, Lt.1')
    RETURNING id INTO t8;

    -- Booking / kontrak untuk masing-masing tenant
    INSERT INTO tenant_bookings
      (tenant_id, unit_code, floor, start_date, end_date, rent_amount, deposit_amount,
       status, booking_status, contract_status, payment_status, site_id,
       period_label, booking_type, billing_cycle, order_number, contract_number)
    VALUES
      (t1, 'SC-01', '1', '2024-01-01', '2026-12-31', 8000000,  16000000, 'aktif', 'active', 'active', 'lunas', 3, 'Jan 2024 - Des 2026', 'sewa', 'bulanan', 'SC-ORD-2024-0001', 'SC-KTR-2024-0001'),
      (t2, 'SC-02', '1', '2024-03-01', '2027-02-28', 8000000,  16000000, 'aktif', 'active', 'active', 'lunas', 3, 'Mar 2024 - Feb 2027', 'sewa', 'bulanan', 'SC-ORD-2024-0002', 'SC-KTR-2024-0002'),
      (t3, 'SC-03', '1', '2023-07-01', '2025-06-30', 8000000,  16000000, 'aktif', 'active', 'active', 'lunas', 3, 'Jul 2023 - Jun 2025', 'sewa', 'bulanan', 'SC-ORD-2023-0001', 'SC-KTR-2023-0001'),
      (t4, 'SC-04', '1', '2024-06-01', '2027-05-31', 6000000,  12000000, 'aktif', 'active', 'active', 'lunas', 3, 'Jun 2024 - Mei 2027', 'sewa', 'bulanan', 'SC-ORD-2024-0003', 'SC-KTR-2024-0003'),
      (t5, 'SC-05', '1', '2025-01-01', '2027-12-31', 4500000,   9000000, 'aktif', 'active', 'active', 'lunas', 3, 'Jan 2025 - Des 2027', 'sewa', 'bulanan', 'SC-ORD-2025-0001', 'SC-KTR-2025-0001'),
      (t6, 'SC-06', '1', '2024-09-01', '2026-08-31', 4500000,   9000000, 'aktif', 'active', 'active', 'lunas', 3, 'Sep 2024 - Agu 2026', 'sewa', 'bulanan', 'SC-ORD-2024-0004', 'SC-KTR-2024-0004'),
      (t7, 'SC-07', '1', '2025-03-01', '2027-02-28', 2500000,   5000000, 'aktif', 'active', 'active', 'lunas', 3, 'Mar 2025 - Feb 2027', 'sewa', 'bulanan', 'SC-ORD-2025-0002', 'SC-KTR-2025-0002'),
      (t8, 'SC-08', '1', '2025-05-01', '2027-04-30', 2500000,   5000000, 'aktif', 'active', 'active', 'lunas', 3, 'Mei 2025 - Apr 2027', 'sewa', 'bulanan', 'SC-ORD-2025-0003', 'SC-KTR-2025-0003');

    -- Update semua unit Sport Center jadi occupied
    UPDATE mall_units SET status = 'occupied' WHERE site_id = 3;

  END IF;
END $$;
    `.trim(),
  },
  {
    name: "0018_cashier_shifts_remaining_columns",
    sql: `
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cashier_shifts' AND column_name='closed_at') THEN
    ALTER TABLE "cashier_shifts" ADD COLUMN "closed_at" timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cashier_shifts' AND column_name='expected_cash') THEN
    ALTER TABLE "cashier_shifts" ADD COLUMN "expected_cash" numeric NOT NULL DEFAULT '0';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cashier_shifts' AND column_name='actual_cash') THEN
    ALTER TABLE "cashier_shifts" ADD COLUMN "actual_cash" numeric;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cashier_shifts' AND column_name='cash_difference') THEN
    ALTER TABLE "cashier_shifts" ADD COLUMN "cash_difference" numeric;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cashier_shifts' AND column_name='notes') THEN
    ALTER TABLE "cashier_shifts" ADD COLUMN "notes" text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cashier_shifts' AND column_name='status') THEN
    ALTER TABLE "cashier_shifts" ADD COLUMN "status" text NOT NULL DEFAULT 'open';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cashier_shifts' AND column_name='updated_at') THEN
    ALTER TABLE "cashier_shifts" ADD COLUMN "updated_at" timestamptz NOT NULL DEFAULT now();
  END IF;
END $$;
    `.trim(),
  },
  {
    name: "0006_mall_units_extended",
    sql: `
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='mall_units' AND column_name='site_id') THEN
    ALTER TABLE "mall_units" ADD COLUMN "site_id" integer;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='mall_units' AND column_name='unit_type') THEN
    ALTER TABLE "mall_units" ADD COLUMN "unit_type" text NOT NULL DEFAULT 'other';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='mall_units' AND column_name='area_kantin') THEN
    ALTER TABLE "mall_units" ADD COLUMN "area_kantin" text;
  END IF;
END $$;

INSERT INTO "mall_sites" ("code","name","type","status","address")
VALUES ('KANTIN_SPORT_CENTER','Kantin Sport Center','sport_center','active','Kawasan Sport Center')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "mall_sites" ("code","name","type","status","address")
VALUES ('KANTIN_TOD_M1','Kantin TOD M1','mall_tenant','active','TOD M1')
ON CONFLICT ("code") DO NOTHING;

UPDATE "mall_units"
SET "site_id" = (SELECT "id" FROM "mall_sites" WHERE "status" = 'active' ORDER BY "id" LIMIT 1)
WHERE "site_id" IS NULL
  AND EXISTS (SELECT 1 FROM "mall_sites" WHERE "status" = 'active');

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'mall_units' AND indexname = 'mall_units_unit_code_unique') THEN
    DROP INDEX "mall_units_unit_code_unique";
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'mall_units' AND indexname = 'mall_units_site_unit_unique') THEN
    CREATE UNIQUE INDEX "mall_units_site_unit_unique" ON "mall_units" ("site_id", "unit_code");
  END IF;
END $$;
    `.trim(),
  },
  {
    name: "0008_cleanup_kantin_sites",
    sql: `

UPDATE "mall_sites" SET "name" = 'Sport Center', "updated_at" = now()
WHERE "code" = 'SPORT_CENTER_BANDARA' AND "name" != 'Sport Center';

UPDATE "mall_sites" SET "name" = 'TOD M1', "updated_at" = now()
WHERE "code" = 'TOD_M1_BANDARA' AND "name" != 'TOD M1';

DO $$
DECLARE
  sc_id  integer;
  ksc_id integer;
  tod_id integer;
  ktod_id integer;
BEGIN
  SELECT id INTO sc_id  FROM "mall_sites" WHERE "code" = 'SPORT_CENTER_BANDARA';
  SELECT id INTO ksc_id FROM "mall_sites" WHERE "code" = 'KANTIN_SPORT_CENTER';
  SELECT id INTO tod_id  FROM "mall_sites" WHERE "code" = 'TOD_M1_BANDARA';
  SELECT id INTO ktod_id FROM "mall_sites" WHERE "code" = 'KANTIN_TOD_M1';

  -- Pindah KANTIN_SPORT_CENTER → SPORT_CENTER_BANDARA
  IF ksc_id IS NOT NULL AND sc_id IS NOT NULL THEN
    UPDATE "tenants"          SET "site_id" = sc_id WHERE "site_id" = ksc_id;
    UPDATE "tenant_bookings"  SET "site_id" = sc_id WHERE "site_id" = ksc_id;
    UPDATE "tenant_invoices"  SET "site_id" = sc_id WHERE "site_id" = ksc_id;
    UPDATE "tenant_payments"  SET "site_id" = sc_id WHERE "site_id" = ksc_id;
    UPDATE "mall_units"       SET "site_id" = sc_id WHERE "site_id" = ksc_id;
    UPDATE "audit_logs"       SET "site_id" = sc_id WHERE "site_id" = ksc_id;
    UPDATE "cashier_shifts"   SET "site_id" = sc_id WHERE "site_id" = ksc_id;
    -- Nonaktifkan site kantin lama
    UPDATE "mall_sites" SET "status" = 'inactive', "updated_at" = now() WHERE "id" = ksc_id;
  END IF;

  -- Pindah KANTIN_TOD_M1 → TOD_M1_BANDARA
  IF ktod_id IS NOT NULL AND tod_id IS NOT NULL THEN
    UPDATE "tenants"          SET "site_id" = tod_id WHERE "site_id" = ktod_id;
    UPDATE "tenant_bookings"  SET "site_id" = tod_id WHERE "site_id" = ktod_id;
    UPDATE "tenant_invoices"  SET "site_id" = tod_id WHERE "site_id" = ktod_id;
    UPDATE "tenant_payments"  SET "site_id" = tod_id WHERE "site_id" = ktod_id;
    UPDATE "mall_units"       SET "site_id" = tod_id WHERE "site_id" = ktod_id;
    UPDATE "audit_logs"       SET "site_id" = tod_id WHERE "site_id" = ktod_id;
    UPDATE "cashier_shifts"   SET "site_id" = tod_id WHERE "site_id" = ktod_id;
    -- Nonaktifkan site kantin lama
    UPDATE "mall_sites" SET "status" = 'inactive', "updated_at" = now() WHERE "id" = ktod_id;
  END IF;

  -- 3. Seed unit kantin sebagai unit/area di bawah site induk
  IF sc_id IS NOT NULL THEN
    INSERT INTO "mall_units" ("unit_code","floor","zone","size_m2","status","position_x","position_y","width","height","notes","site_id","unit_type")
    VALUES
      ('SC-KTN-01','1','Area Kantin', 9,'available',0,0,2,2,'Unit Kantin Sport Center 1',sc_id,'kantin'),
      ('SC-KTN-02','1','Area Kantin', 9,'available',2,0,2,2,'Unit Kantin Sport Center 2',sc_id,'kantin'),
      ('SC-KTN-03','1','Area Kantin', 9,'available',4,0,2,2,'Unit Kantin Sport Center 3',sc_id,'kantin')
    ON CONFLICT ("site_id","unit_code") DO NOTHING;
  END IF;

  IF tod_id IS NOT NULL THEN
    INSERT INTO "mall_units" ("unit_code","floor","zone","size_m2","status","position_x","position_y","width","height","notes","site_id","unit_type")
    VALUES
      ('TOD-KTN-01','1','Area Kantin', 9,'available',0,0,2,2,'Unit Kantin TOD M1 1',tod_id,'kantin'),
      ('TOD-KTN-02','1','Area Kantin', 9,'available',2,0,2,2,'Unit Kantin TOD M1 2',tod_id,'kantin'),
      ('TOD-KTN-03','1','Area Kantin', 9,'available',4,0,2,2,'Unit Kantin TOD M1 3',tod_id,'kantin')
    ON CONFLICT ("site_id","unit_code") DO NOTHING;
  END IF;
END $$;
    `.trim(),
  },
  {
    name: "0007_system_settings_and_units_seed",
    sql: `
CREATE TABLE IF NOT EXISTS "system_settings" (
  "id" serial PRIMARY KEY NOT NULL,
  "key" text NOT NULL UNIQUE,
  "value" jsonb,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

INSERT INTO "system_settings" ("key", "value")
VALUES ('mall_config', '{"mallName":"Mall Admin","tagline":"Manajemen Tenant Mall","address":"","phone":"","email":"","invoicePrefix":"INV-TENANT","taxRate":0,"currency":"IDR","logoUrl":""}')
ON CONFLICT ("key") DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "mall_units" LIMIT 1) THEN
    INSERT INTO "mall_units" ("unit_code","floor","zone","size_m2","status","position_x","position_y","width","height","notes") VALUES
    ('A-01','1','Zona A',24,'occupied',0,0,3,2,'Warung Nasi Bu Sari'),
    ('A-02','1','Zona A',24,'occupied',3,0,3,2,'Toko Baju Murah'),
    ('A-03','1','Zona A',20,'available',6,0,2,2,NULL),
    ('A-04','1','Zona A',20,'available',8,0,2,2,NULL),
    ('A-05','1','Zona A',30,'maintenance',10,0,3,2,'Sedang renovasi'),
    ('B-01','1','Zona B',36,'occupied',0,2,3,3,'Kafe Kopi Nusantara'),
    ('B-02','1','Zona B',36,'occupied',3,2,3,3,'Apotek Sehat'),
    ('B-03','1','Zona B',30,'available',6,2,3,3,NULL),
    ('B-04','1','Zona B',24,'available',9,2,2,3,NULL),
    ('C-01','1','Zona C',18,'overdue',0,5,2,2,'Pembayaran telat 2 bulan'),
    ('C-02','1','Zona C',18,'occupied',2,5,2,2,NULL),
    ('C-03','1','Zona C',18,'available',4,5,2,2,NULL),
    ('D-01','2','Zona D',45,'occupied',0,0,4,3,'Fashion Store Premium'),
    ('D-02','2','Zona D',45,'occupied',4,0,4,3,'Elektronik Jaya'),
    ('D-03','2','Zona D',30,'available',8,0,3,3,NULL),
    ('E-01','2','Zona E',36,'occupied',0,3,3,3,'Salon & Spa'),
    ('E-02','2','Zona E',36,'maintenance',3,3,3,3,'Perbaikan AC'),
    ('E-03','2','Zona E',30,'available',6,3,3,3,NULL),
    ('E-04','2','Zona E',24,'available',9,3,2,3,NULL),
    ('F-01','2','Zona F',60,'occupied',0,6,4,4,'Supermarket Mini'),
    ('F-02','2','Zona F',40,'available',4,6,3,4,NULL);
  END IF;
END $$;
    `.trim(),
  },
  {
    name: "0020_users_force_logout_at",
    sql: `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "force_logout_at" timestamptz;`.trim(),
  },
  {
    name: "0021_invoice_due_reminders",
    sql: `
ALTER TABLE "tenant_invoices" ADD COLUMN IF NOT EXISTS "due_reminder_3d_at" timestamptz;
ALTER TABLE "tenant_invoices" ADD COLUMN IF NOT EXISTS "due_reminder_1d_at" timestamptz;
    `.trim(),
  },
  {
    name: "0024_wa_send_logs",
    sql: `
CREATE TABLE IF NOT EXISTS "wa_send_logs" (
  "id" serial PRIMARY KEY NOT NULL,
  "site_id" integer,
  "tenant_id" integer,
  "invoice_id" integer,
  "phone" text NOT NULL,
  "message_type" text NOT NULL,
  "status" text NOT NULL,
  "error_message" text,
  "sent_by" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "wa_send_logs_created_at_idx" ON "wa_send_logs" ("created_at" DESC);
CREATE INDEX IF NOT EXISTS "wa_send_logs_site_id_idx" ON "wa_send_logs" ("site_id");
    `.trim(),
  },
  {
    name: "0026_tenant_contract_dates",
    sql: `
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenants' AND column_name='contract_start_date') THEN
    ALTER TABLE "tenants" ADD COLUMN "contract_start_date" date;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenants' AND column_name='contract_end_date') THEN
    ALTER TABLE "tenants" ADD COLUMN "contract_end_date" date;
  END IF;
END $$;
    `.trim(),
  },
  {
    name: "0025_tenant_default_prices",
    sql: `
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenants' AND column_name='default_rent_amount') THEN
    ALTER TABLE "tenants" ADD COLUMN "default_rent_amount" numeric DEFAULT '0';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenants' AND column_name='default_service_charge_amount') THEN
    ALTER TABLE "tenants" ADD COLUMN "default_service_charge_amount" numeric DEFAULT '0';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenants' AND column_name='default_electricity_charge_amount') THEN
    ALTER TABLE "tenants" ADD COLUMN "default_electricity_charge_amount" numeric DEFAULT '0';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenants' AND column_name='default_water_charge_amount') THEN
    ALTER TABLE "tenants" ADD COLUMN "default_water_charge_amount" numeric DEFAULT '0';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenants' AND column_name='default_other_charge_amount') THEN
    ALTER TABLE "tenants" ADD COLUMN "default_other_charge_amount" numeric DEFAULT '0';
  END IF;
END $$;
    `.trim(),
  },
  {
    name: "0027_mall_units_default_rent",
    sql: `ALTER TABLE mall_units ADD COLUMN IF NOT EXISTS default_rent_amount numeric DEFAULT 0;`,
  },
  {
    name: "0029_short_payment_tokens",
    sql: `
UPDATE "tenant_invoices"
SET payment_token = substr(md5(random()::text || clock_timestamp()::text || id::text), 1, 12)
WHERE payment_token IS NOT NULL
  AND LENGTH(payment_token) > 20;

ALTER TABLE "tenant_invoices"
  ALTER COLUMN payment_token SET DEFAULT substr(md5(random()::text || clock_timestamp()::text), 1, 12);
    `.trim(),
  },
  {
    name: "0028_bank_reconciliation",
    sql: `
CREATE TABLE IF NOT EXISTS "bank_mutations" (
  "id" serial PRIMARY KEY NOT NULL,
  "bank_account_id" text,
  "transaction_date" text NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "credit_amount" numeric NOT NULL DEFAULT '0',
  "debit_amount" numeric NOT NULL DEFAULT '0',
  "amount" numeric NOT NULL,
  "direction" text NOT NULL,
  "mutation_key" text NOT NULL,
  "normalized_description" text NOT NULL DEFAULT '',
  "provider_name" text,
  "provider_order_id" text,
  "raw_payload" jsonb,
  "status" text NOT NULL DEFAULT 'unmatched',
  "matched_payment_id" integer,
  "matched_order_id" integer,
  "uploaded_proof_url" text,
  "site_id" integer REFERENCES "mall_sites"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "bank_reconciliation_matches" (
  "id" serial PRIMARY KEY NOT NULL,
  "mutation_id" integer NOT NULL REFERENCES "bank_mutations"("id") ON DELETE CASCADE,
  "candidate_type" text NOT NULL,
  "candidate_id" integer NOT NULL,
  "match_score" integer NOT NULL DEFAULT 0,
  "match_reason" text,
  "amount_match" boolean NOT NULL DEFAULT false,
  "date_match" boolean NOT NULL DEFAULT false,
  "name_match" boolean NOT NULL DEFAULT false,
  "order_id_match" boolean NOT NULL DEFAULT false,
  "proof_match" boolean NOT NULL DEFAULT false,
  "status" text NOT NULL DEFAULT 'candidate',
  "created_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE tablename = 'bank_mutations' AND indexname = 'bank_mutations_mutation_key_idx'
  ) THEN
    CREATE INDEX bank_mutations_mutation_key_idx ON "bank_mutations" ("mutation_key");
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE tablename = 'bank_mutations' AND indexname = 'bank_mutations_status_idx'
  ) THEN
    CREATE INDEX bank_mutations_status_idx ON "bank_mutations" ("status");
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE tablename = 'bank_reconciliation_matches' AND indexname = 'brm_mutation_id_idx'
  ) THEN
    CREATE INDEX brm_mutation_id_idx ON "bank_reconciliation_matches" ("mutation_id");
  END IF;
END $$;
    `.trim(),
  },
  {
    name: "0030_audit_logs_tenant_id",
    sql: `
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS tenant_id integer;
    `.trim(),
  },
  {
    name: "0032_missing_tables",
    sql: `
-- system_settings
CREATE TABLE IF NOT EXISTS "system_settings" (
  "id" serial PRIMARY KEY NOT NULL,
  "key" text NOT NULL UNIQUE,
  "value" jsonb,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
INSERT INTO "system_settings" ("key", "value")
VALUES ('mall_config', '{"mallName":"Mall Admin","tagline":"Manajemen Tenant Mall","address":"","phone":"","email":"","invoicePrefix":"INV-TENANT","taxRate":0,"currency":"IDR","logoUrl":"","adminPhone":"","waSenderPhone":"","waSenderLabel":"","paymentDomain":"","invoiceColor":"#1e3a5f","invoiceFooterNote":"","invoiceSignerName":""}')
ON CONFLICT ("key") DO NOTHING;

-- finance_payment_events
CREATE TABLE IF NOT EXISTS "finance_payment_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "source_app" text NOT NULL,
  "owner_app" text NOT NULL,
  "source_module" text NOT NULL,
  "source_table" text NOT NULL,
  "source_id" integer NOT NULL,
  "owner_company_id" integer,
  "owner_tenant_id" integer,
  "tenant_id" integer REFERENCES "tenants"("id"),
  "site_id" integer REFERENCES "mall_sites"("id"),
  "invoice_id" integer,
  "amount" numeric NOT NULL,
  "direction" text NOT NULL DEFAULT 'IN',
  "payment_method" text NOT NULL,
  "payment_reference" text,
  "external_order_id" text,
  "payment_status" text NOT NULL DEFAULT 'pending',
  "proof_url" text,
  "bank_mutation_id" integer,
  "is_reconciled" boolean NOT NULL DEFAULT false,
  "reconciled_at" timestamptz,
  "created_by_app" text,
  "approval_scope" text,
  "metadata" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- bank_account_balances
CREATE TABLE IF NOT EXISTS "bank_account_balances" (
  "id" serial PRIMARY KEY NOT NULL,
  "bank_account_id" text NOT NULL,
  "company_id" integer,
  "owner_app" text,
  "owner_tenant_id" integer,
  "site_id" integer REFERENCES "mall_sites"("id"),
  "current_balance" numeric NOT NULL DEFAULT '0',
  "last_reconciled_balance" numeric,
  "last_reconciled_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- bank_closing_periods
CREATE TABLE IF NOT EXISTS "bank_closing_periods" (
  "id" serial PRIMARY KEY NOT NULL,
  "year_month" text NOT NULL UNIQUE,
  "locked_by" text,
  "locked_by_role" text,
  "notes" text,
  "site_id" integer REFERENCES "mall_sites"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- bank_coa_rules
CREATE TABLE IF NOT EXISTS "bank_coa_rules" (
  "id" serial PRIMARY KEY NOT NULL,
  "provider_name" text,
  "direction" text NOT NULL DEFAULT 'ALL',
  "description_pattern" text,
  "coa_code" text NOT NULL,
  "coa_name" text NOT NULL,
  "description" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- bank_journal_entries
CREATE TABLE IF NOT EXISTS "bank_journal_entries" (
  "id" serial PRIMARY KEY NOT NULL,
  "journal_id" text NOT NULL UNIQUE,
  "mutation_id" integer REFERENCES "bank_mutations"("id"),
  "company_id" integer,
  "owner_app" text,
  "source_app" text,
  "source_module" text,
  "transaction_date" text NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "debit_account_id" text,
  "credit_account_id" text,
  "debit_amount" numeric NOT NULL DEFAULT '0',
  "credit_amount" numeric NOT NULL DEFAULT '0',
  "currency" text NOT NULL DEFAULT 'IDR',
  "status" text NOT NULL DEFAULT 'posted',
  "created_by" text,
  "site_id" integer REFERENCES "mall_sites"("id"),
  "metadata" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- bank_recon_audit_logs
CREATE TABLE IF NOT EXISTS "bank_recon_audit_logs" (
  "id" serial PRIMARY KEY NOT NULL,
  "mutation_id" integer,
  "match_id" integer,
  "finance_payment_event_id" integer,
  "journal_id" text,
  "action" text NOT NULL,
  "action_app" text,
  "action_user_id" text,
  "action_role" text,
  "owner_app" text,
  "owner_company_id" integer,
  "owner_tenant_id" integer,
  "source_app" text,
  "source_module" text,
  "before_value" jsonb,
  "after_value" jsonb,
  "metadata" jsonb,
  "ip_address" text,
  "user_agent" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
    `.trim(),
  },
  {
    name: "0031_system_settings_table",
    sql: `
CREATE TABLE IF NOT EXISTS system_settings (
  id serial PRIMARY KEY NOT NULL,
  key text NOT NULL UNIQUE,
  value jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO system_settings (key, value)
VALUES ('mall_config', '{"mallName":"Mall Admin","tagline":"Manajemen Tenant Mall","address":"","phone":"","email":"","invoicePrefix":"INV-TENANT","taxRate":0,"currency":"IDR","logoUrl":"","adminPhone":"","waSenderPhone":"","waSenderLabel":"","paymentDomain":"","invoiceColor":"#1e3a5f","invoiceFooterNote":"","invoiceSignerName":""}')
ON CONFLICT (key) DO NOTHING;
    `.trim(),
  },
  {
    name: "0032_bank_mutations_extended_columns",
    sql: `
ALTER TABLE bank_mutations
  ADD COLUMN IF NOT EXISTS company_id integer,
  ADD COLUMN IF NOT EXISTS owner_app text,
  ADD COLUMN IF NOT EXISTS owner_company_id integer,
  ADD COLUMN IF NOT EXISTS owner_tenant_id integer,
  ADD COLUMN IF NOT EXISTS source_app text,
  ADD COLUMN IF NOT EXISTS source_module text,
  ADD COLUMN IF NOT EXISTS source_table text,
  ADD COLUMN IF NOT EXISTS source_id integer,
  ADD COLUMN IF NOT EXISTS approved_by_app text,
  ADD COLUMN IF NOT EXISTS approved_by_role text,
  ADD COLUMN IF NOT EXISTS accounting_posted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS journal_id text;
    `.trim(),
  },
  {
    name: "0033_bank_account_balances_table",
    sql: `
CREATE TABLE IF NOT EXISTS bank_account_balances (
  id serial PRIMARY KEY NOT NULL,
  bank_account_id text NOT NULL,
  company_id integer,
  owner_app text,
  owner_tenant_id integer,
  site_id integer,
  current_balance numeric NOT NULL DEFAULT '0',
  last_reconciled_balance numeric,
  last_reconciled_at timestamptz,
  opening_balance numeric DEFAULT '0',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
    `.trim(),
  },
  {
    name: "0031_fix_mall_units_constraint_and_kantin",
    sql: `
-- Tambah kolom unit_type dan area_kantin jika belum ada
ALTER TABLE mall_units ADD COLUMN IF NOT EXISTS unit_type text NOT NULL DEFAULT 'other';
ALTER TABLE mall_units ADD COLUMN IF NOT EXISTS area_kantin text;

-- Ganti unique constraint global unit_code menjadi per (site_id, unit_code)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'mall_units' AND indexname = 'mall_units_unit_code_unique') THEN
    DROP INDEX "mall_units_unit_code_unique";
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'mall_units' AND indexname = 'mall_units_site_unit_unique') THEN
    CREATE UNIQUE INDEX "mall_units_site_unit_unique" ON "mall_units" ("site_id", "unit_code");
  END IF;
END $$;

-- Insert unit kantin Sport Center (site_id=2) yang hilang akibat konflik constraint lama
INSERT INTO mall_units (id, unit_code, unit_type, area_kantin, floor, size_m2, position_x, position_y, width, height, status, site_id)
VALUES
  (60, 'SC-KTN-01', 'food_booth',     'AREA KANTIN', 'Main', '12', 0, 0, 3, 2, 'available', 2),
  (61, 'SC-KTN-02', 'beverage_booth', 'AREA KANTIN', 'Main', '10', 3, 0, 3, 2, 'available', 2),
  (62, 'SC-KTN-03', 'food_booth',     'AREA KANTIN', 'Main',  '8', 6, 0, 2, 2, 'available', 2)
ON CONFLICT DO NOTHING;

-- Update unit_type dan area_kantin untuk unit kantin yang sudah ada
UPDATE mall_units SET unit_type='food_booth',     area_kantin='AREA KANTIN' WHERE id=127;
UPDATE mall_units SET unit_type='food_booth'                                WHERE id=109 AND unit_type='other';
UPDATE mall_units SET unit_type='beverage_booth'                            WHERE id=110 AND unit_type='other';
UPDATE mall_units SET unit_type='storage'                                   WHERE id=111 AND unit_type='other';
UPDATE mall_units SET unit_type='food_booth'                                WHERE id=112 AND unit_type='other';
UPDATE mall_units SET unit_type='beverage_booth'                            WHERE id=113 AND unit_type='other';
UPDATE mall_units SET unit_type='storage'                                   WHERE id=114 AND unit_type='other';
    `.trim(),
  },
  {
    name: "0034_draft_agreements",
    sql: `
CREATE TABLE IF NOT EXISTS "tenant_draft_agreements" (
  "id" serial PRIMARY KEY NOT NULL,
  "token" text UNIQUE NOT NULL,
  "site_id" integer NOT NULL,
  "doc_type" text NOT NULL DEFAULT 'surat_minat',
  "tenant_name" text NOT NULL,
  "brand_name" text NOT NULL,
  "business_type" text NOT NULL,
  "email" text,
  "phone" text NOT NULL,
  "address" text,
  "unit_code" text,
  "area_name" text,
  "start_date" date,
  "end_date" date,
  "duration_months" integer,
  "period_label" text,
  "rent_amount" numeric NOT NULL DEFAULT '0',
  "deposit_amount" numeric NOT NULL DEFAULT '0',
  "payment_terms" text,
  "notes" text,
  "status" text NOT NULL DEFAULT 'pending',
  "responded_at" timestamptz,
  "responded_name" text,
  "responded_email" text,
  "responded_phone" text,
  "rejection_reason" text,
  "ip_address" text,
  "created_by" text,
  "expires_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "draft_agreements_site_id_idx" ON "tenant_draft_agreements" ("site_id");
CREATE INDEX IF NOT EXISTS "draft_agreements_status_idx" ON "tenant_draft_agreements" ("status");
CREATE INDEX IF NOT EXISTS "draft_agreements_created_at_idx" ON "tenant_draft_agreements" ("created_at" DESC);
    `.trim(),
  },
  {
    name: "0039_coa_and_journal_tables",
    sql: `
CREATE TABLE IF NOT EXISTS bank_journal_entries (
  id serial PRIMARY KEY NOT NULL,
  journal_id text NOT NULL UNIQUE,
  mutation_id integer,
  company_id integer,
  owner_app text,
  source_app text,
  source_module text,
  transaction_date text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  debit_account_id text,
  debit_account_name text,
  credit_account_id text,
  credit_account_name text,
  debit_amount numeric NOT NULL DEFAULT '0',
  credit_amount numeric NOT NULL DEFAULT '0',
  tax_amount numeric NOT NULL DEFAULT '0',
  tax_account_id text,
  tax_account_name text,
  currency text NOT NULL DEFAULT 'IDR',
  status text NOT NULL DEFAULT 'posted',
  created_by text,
  site_id integer,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE bank_journal_entries
  ADD COLUMN IF NOT EXISTS debit_account_name text,
  ADD COLUMN IF NOT EXISTS credit_account_name text,
  ADD COLUMN IF NOT EXISTS tax_amount numeric DEFAULT '0',
  ADD COLUMN IF NOT EXISTS tax_account_id text,
  ADD COLUMN IF NOT EXISTS tax_account_name text,
  ADD COLUMN IF NOT EXISTS owner_app text,
  ADD COLUMN IF NOT EXISTS source_app text,
  ADD COLUMN IF NOT EXISTS source_module text,
  ADD COLUMN IF NOT EXISTS transaction_date text,
  ADD COLUMN IF NOT EXISTS currency text DEFAULT 'IDR',
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'posted',
  ADD COLUMN IF NOT EXISTS site_id integer,
  ADD COLUMN IF NOT EXISTS metadata jsonb,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE TABLE IF NOT EXISTS bank_coa_rules (
  id serial PRIMARY KEY NOT NULL,
  provider_name text,
  direction text NOT NULL DEFAULT 'ALL',
  description_pattern text,
  coa_code text NOT NULL UNIQUE,
  coa_name text NOT NULL,
  account_type text NOT NULL DEFAULT 'other',
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE bank_coa_rules
  ADD COLUMN IF NOT EXISTS account_type text DEFAULT 'other';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bank_coa_rules_coa_code_key'
  ) THEN
    ALTER TABLE bank_coa_rules ADD CONSTRAINT bank_coa_rules_coa_code_key UNIQUE (coa_code);
  END IF;
END $$;

INSERT INTO bank_coa_rules (coa_code, coa_name, account_type, direction, description, is_active) VALUES
  ('1-1001', 'Kas dan Bank',              'kas',        'ALL', 'Akun utama kas masuk dan keluar',                   true),
  ('1-1002', 'Piutang Sewa',              'piutang',    'IN',  'Piutang atas tagihan sewa tenant',                  true),
  ('4-1001', 'Pendapatan Sewa',           'pendapatan', 'IN',  'Pendapatan dari sewa unit tenant',                  true),
  ('4-1002', 'Pendapatan Service Charge', 'pendapatan', 'IN',  'Pendapatan service charge / biaya layanan',         true),
  ('4-1003', 'Pendapatan Denda',          'pendapatan', 'IN',  'Pendapatan dari denda dan penalti keterlambatan',   true),
  ('4-1004', 'Pendapatan Lainnya',        'pendapatan', 'IN',  'Pendapatan lain-lain di luar kategori utama',       true),
  ('2-1001', 'Hutang PPN Keluaran',       'ppn',        'IN',  'PPN 11% atas pendapatan sewa (PPN Keluaran)',       true),
  ('2-1002', 'Hutang PPh Pasal 4 ayat 2', 'pph',       'IN',  'PPh Final 10% atas sewa tanah/bangunan komersial',  true),
  ('5-1001', 'Biaya Operasional',         'biaya',      'OUT', 'Biaya operasional umum (administrasi, dll)',        true),
  ('5-1002', 'Biaya Utilitas',            'biaya',      'OUT', 'Biaya listrik, air, dan gas',                      true),
  ('5-1003', 'Biaya Perawatan Gedung',    'biaya',      'OUT', 'Biaya perawatan dan perbaikan fasilitas gedung',    true),
  ('5-1004', 'Biaya Bank & Administrasi', 'biaya',      'OUT', 'Biaya transfer bank, admin, dan biaya keuangan',   true)
ON CONFLICT (coa_code) DO UPDATE SET
  coa_name     = EXCLUDED.coa_name,
  account_type = EXCLUDED.account_type,
  description  = EXCLUDED.description;
    `.trim(),
  },
  {
    name: "0040_draft_agreements_ext",
    sql: `
ALTER TABLE tenant_draft_agreements ADD COLUMN IF NOT EXISTS pic_name text;
ALTER TABLE tenant_draft_agreements ADD COLUMN IF NOT EXISTS source text DEFAULT 'admin';
ALTER TABLE tenant_draft_agreements ADD COLUMN IF NOT EXISTS interested_unit text;
    `.trim(),
  },
  {
    name: "0041_bank_closing_periods",
    sql: `
CREATE TABLE IF NOT EXISTS bank_closing_periods (
  id serial PRIMARY KEY NOT NULL,
  year_month text NOT NULL UNIQUE,
  locked_by text,
  locked_by_role text,
  notes text,
  site_id integer REFERENCES mall_sites(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS bank_recon_audit_logs (
  id serial PRIMARY KEY NOT NULL,
  mutation_id integer,
  match_id integer,
  finance_payment_event_id integer,
  journal_id text,
  action text NOT NULL,
  action_app text,
  action_user_id text,
  action_role text,
  owner_app text,
  owner_company_id integer,
  owner_tenant_id integer,
  source_app text,
  source_module text,
  before_value jsonb,
  after_value jsonb,
  metadata jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
    `.trim(),
  },
  {
    name: "0042_draft_agreements_booking_ref",
    sql: `
ALTER TABLE tenant_draft_agreements ADD COLUMN IF NOT EXISTS tenant_id integer;
ALTER TABLE tenant_draft_agreements ADD COLUMN IF NOT EXISTS booking_id integer;
    `.trim(),
  },
  {
    name: "0040_finance_payment_events",
    sql: `
CREATE TABLE IF NOT EXISTS finance_payment_events (
  id serial PRIMARY KEY NOT NULL,
  source_app text NOT NULL,
  owner_app text NOT NULL,
  source_module text NOT NULL,
  source_table text NOT NULL,
  source_id integer NOT NULL,
  owner_company_id integer,
  owner_tenant_id integer,
  tenant_id integer,
  site_id integer,
  invoice_id integer,
  amount numeric NOT NULL,
  direction text NOT NULL DEFAULT 'IN',
  payment_method text NOT NULL,
  payment_reference text,
  external_order_id text,
  payment_status text NOT NULL DEFAULT 'pending',
  proof_url text,
  bank_mutation_id integer,
  is_reconciled boolean NOT NULL DEFAULT false,
  reconciled_at timestamptz,
  created_by_app text,
  approval_scope text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
    `.trim(),
  },
  {
    name: "0043_tenant_payments_ocr_columns",
    sql: `
ALTER TABLE tenant_payments ADD COLUMN IF NOT EXISTS ocr_extracted_amount numeric;
ALTER TABLE tenant_payments ADD COLUMN IF NOT EXISTS ocr_raw_text text;
ALTER TABLE tenant_payments ADD COLUMN IF NOT EXISTS ocr_confidence numeric;
    `.trim(),
  },
  {
    name: "0044_tenant_trash_charge",
    sql: `
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS default_trash_charge_amount numeric DEFAULT 0;
ALTER TABLE tenant_invoices ADD COLUMN IF NOT EXISTS trash_charge_amount numeric NOT NULL DEFAULT 0;
    `.trim(),
  },
];

const MIGRATIONS_TABLE = "schema_migrations";

export async function runMigrations(): Promise<void> {
  const client = new pg.Client({
    ...dbConfig.parsed,
    ssl: dbConfig.ssl,
  });

  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${MIGRATIONS_TABLE}" (
        "name" text PRIMARY KEY NOT NULL,
        "applied_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    for (const migration of MIGRATIONS) {
      const result = await client.query(
        `SELECT 1 FROM "${MIGRATIONS_TABLE}" WHERE name = $1`,
        [migration.name],
      );

      if (result.rowCount && result.rowCount > 0) {
        console.log(`[migrate] ${migration.name} — sudah diterapkan, dilewati`);
        continue;
      }

      console.log(`[migrate] Menerapkan ${migration.name}...`);
      await client.query(migration.sql);
      await client.query(
        `INSERT INTO "${MIGRATIONS_TABLE}" (name) VALUES ($1)`,
        [migration.name],
      );
      console.log(`[migrate] ${migration.name} — selesai`);
    }

    console.log("[migrate] Schema sinkronisasi selesai ✓");
  } finally {
    await client.end();
  }
}

// Migration tambahan: konversi users.id dari integer ke text (untuk Supabase lama)
export async function runUsersIdTextMigration(): Promise<void> {
  const client = new pg.Client({
    ...dbConfig.parsed,
    ssl: dbConfig.ssl,
  });

  await client.connect();

  try {
    const res = await client.query(
      `SELECT data_type FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'id'`
    );
    const dataType = res.rows[0]?.data_type;

    if (dataType === "integer") {
      console.log("[migrate] Mengkonversi users.id dari integer ke text...");

      // Drop FK dari user_site_access
      await client.query(`
        ALTER TABLE user_site_access DROP CONSTRAINT IF EXISTS user_site_access_user_id_users_id_fk;
        ALTER TABLE user_site_access DROP CONSTRAINT IF EXISTS user_site_access_user_id_fkey;
      `);

      // Konversi users.id ke text
      await client.query(`ALTER TABLE users ALTER COLUMN id DROP DEFAULT`);
      await client.query(`ALTER TABLE users ALTER COLUMN id TYPE text USING id::text`);
      await client.query(`ALTER TABLE users ALTER COLUMN id SET DEFAULT gen_random_uuid()::text`);

      // Konversi user_site_access.user_id ke text
      await client.query(`ALTER TABLE user_site_access ALTER COLUMN user_id TYPE text USING user_id::text`);

      console.log("[migrate] Konversi users.id selesai ✓");
    } else {
      console.log("[migrate] users.id sudah text, dilewati");
    }
  } finally {
    await client.end();
  }
}

MIGRATIONS.push({
  name: "0045_payment_receipts",
  sql: `
CREATE TABLE IF NOT EXISTS "payment_receipts" (
  "id" serial PRIMARY KEY NOT NULL,
  "payment_id" integer NOT NULL,
  "invoice_id" integer,
  "tenant_id" integer NOT NULL,
  "site_id" integer REFERENCES "mall_sites"("id"),
  "receipt_number" text NOT NULL UNIQUE,
  "file_url" text NOT NULL,
  "invoice_number" text,
  "business_name" text,
  "owner_name" text,
  "unit_code" text,
  "amount_paid" numeric NOT NULL DEFAULT '0',
  "tax_amount" numeric NOT NULL DEFAULT '0',
  "net_amount" numeric NOT NULL DEFAULT '0',
  "payment_method" text,
  "kasir_name" text,
  "journal_id" text,
  "wa_status" text NOT NULL DEFAULT 'pending',
  "wa_error" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
  `.trim(),
},
{
  name: "0046_payment_ledger_columns",
  sql: `
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_payments' AND column_name='reference_id') THEN
    ALTER TABLE "tenant_payments" ADD COLUMN "reference_id" text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_payments' AND column_name='source_type') THEN
    ALTER TABLE "tenant_payments" ADD COLUMN "source_type" text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'tenant_payments' AND indexname = 'tenant_payments_reference_id_unique'
  ) THEN
    CREATE UNIQUE INDEX tenant_payments_reference_id_unique
      ON "tenant_payments" ("reference_id")
      WHERE reference_id IS NOT NULL;
  END IF;
END $$;
  `.trim(),
},
{
  name: "0047_invoice_ppn_amount",
  sql: `
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_invoices' AND column_name='ppn_amount') THEN
    ALTER TABLE "tenant_invoices" ADD COLUMN "ppn_amount" numeric NOT NULL DEFAULT '0';
  END IF;
END $$;
  `.trim(),
},
{
  name: "0048_payment_ledger_remaining_balance",
  sql: `
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_payments' AND column_name='remaining_balance_after') THEN
    ALTER TABLE "tenant_payments" ADD COLUMN "remaining_balance_after" numeric;
  END IF;
END $$;
  `.trim(),
});
