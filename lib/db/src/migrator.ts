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
-- Tambah kolom baru ke tenants
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

-- Tambah kolom kontrak baru ke tenant_bookings
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

-- Migrasi status lama ke nilai baru untuk tenant_bookings
UPDATE "tenant_bookings" SET contract_status = 'active' WHERE booking_status = 'aktif' AND contract_status = 'draft';
UPDATE "tenant_bookings" SET contract_status = 'expired' WHERE booking_status = 'selesai' AND contract_status = 'draft';
UPDATE "tenant_bookings" SET contract_status = 'terminated' WHERE booking_status = 'batal' AND contract_status = 'draft';

-- Seed: Tambah tenant contoh jika tabel kosong
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

-- Seed: Tambah kontrak contoh jika tenant_bookings kosong
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
-- Buat tabel tenant_invoices
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

-- FK tenant_invoices -> tenants
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'tenant_invoices_tenant_id_tenants_id_fk'
  ) THEN
    ALTER TABLE "tenant_invoices"
      ADD CONSTRAINT "tenant_invoices_tenant_id_tenants_id_fk"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;

-- FK tenant_invoices -> tenant_bookings
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'tenant_invoices_booking_id_tenant_bookings_id_fk'
  ) THEN
    ALTER TABLE "tenant_invoices"
      ADD CONSTRAINT "tenant_invoices_booking_id_tenant_bookings_id_fk"
      FOREIGN KEY ("booking_id") REFERENCES "tenant_bookings"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;

-- Tambah kolom invoice_id ke tenant_payments
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_payments' AND column_name='invoice_id') THEN
    ALTER TABLE "tenant_payments" ADD COLUMN "invoice_id" integer;
  END IF;
END $$;

-- Seed: Tambah invoice contoh berdasarkan booking yang ada
DO $$
DECLARE
  b1 record;
  b2 record;
  t1 record;
  t2 record;
BEGIN
  SELECT tb.*, te.business_name, te.owner_name, te.booth_number, te.area_name
    INTO b1
    FROM tenant_bookings tb JOIN tenants te ON te.id = tb.tenant_id
    ORDER BY tb.id LIMIT 1 OFFSET 0;

  SELECT tb.*, te.business_name, te.owner_name, te.booth_number, te.area_name
    INTO b2
    FROM tenant_bookings tb JOIN tenants te ON te.id = tb.tenant_id
    ORDER BY tb.id LIMIT 1 OFFSET 1;

  IF b1.id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM tenant_invoices LIMIT 1) THEN
    INSERT INTO "tenant_invoices" (
      invoice_number, tenant_id, booking_id, unit_code,
      period_start, period_end, due_date,
      rent_amount, service_charge_amount, electricity_charge_amount, water_charge_amount,
      other_charge_amount, discount_amount, penalty_amount,
      subtotal, tax_amount, total_amount, paid_amount, outstanding_amount, status, notes
    ) VALUES (
      'INV-TENANT/202506/00001', b1.tenant_id, b1.id, b1.unit_code,
      '2025-06-01', '2025-06-30', '2025-06-10',
      COALESCE(b1.rent_amount, 0),
      COALESCE(b1.service_charge_amount, 0),
      COALESCE(b1.electricity_charge_amount, 0),
      COALESCE(b1.water_charge_amount, 0),
      0, 0, 0,
      COALESCE(b1.rent_amount,0) + COALESCE(b1.service_charge_amount,0) + COALESCE(b1.electricity_charge_amount,0) + COALESCE(b1.water_charge_amount,0),
      0,
      COALESCE(b1.rent_amount,0) + COALESCE(b1.service_charge_amount,0) + COALESCE(b1.electricity_charge_amount,0) + COALESCE(b1.water_charge_amount,0),
      COALESCE(b1.rent_amount,0) + COALESCE(b1.service_charge_amount,0) + COALESCE(b1.electricity_charge_amount,0) + COALESCE(b1.water_charge_amount,0),
      0,
      'paid',
      'Invoice Juni 2025 - lunas'
    );
  END IF;

  IF b2.id IS NOT NULL AND (SELECT count(*) FROM tenant_invoices) < 2 THEN
    INSERT INTO "tenant_invoices" (
      invoice_number, tenant_id, booking_id, unit_code,
      period_start, period_end, due_date,
      rent_amount, service_charge_amount, electricity_charge_amount, water_charge_amount,
      other_charge_amount, discount_amount, penalty_amount,
      subtotal, tax_amount, total_amount, paid_amount, outstanding_amount, status, notes
    ) VALUES (
      'INV-TENANT/202507/00001', b2.tenant_id, b2.id, b2.unit_code,
      '2025-07-01', '2025-07-31', '2025-07-10',
      COALESCE(b2.rent_amount, 0),
      COALESCE(b2.service_charge_amount, 0),
      COALESCE(b2.electricity_charge_amount, 0),
      COALESCE(b2.water_charge_amount, 0),
      0, 0, 0,
      COALESCE(b2.rent_amount,0) + COALESCE(b2.service_charge_amount,0) + COALESCE(b2.electricity_charge_amount,0) + COALESCE(b2.water_charge_amount,0),
      0,
      COALESCE(b2.rent_amount,0) + COALESCE(b2.service_charge_amount,0) + COALESCE(b2.electricity_charge_amount,0) + COALESCE(b2.water_charge_amount,0),
      0,
      COALESCE(b2.rent_amount,0) + COALESCE(b2.service_charge_amount,0) + COALESCE(b2.electricity_charge_amount,0) + COALESCE(b2.water_charge_amount,0),
      'unpaid',
      'Invoice Juli 2025 - belum bayar'
    );
  END IF;

  IF b1.id IS NOT NULL AND (SELECT count(*) FROM tenant_invoices) < 3 THEN
    INSERT INTO "tenant_invoices" (
      invoice_number, tenant_id, booking_id, unit_code,
      period_start, period_end, due_date,
      rent_amount, service_charge_amount, electricity_charge_amount, water_charge_amount,
      other_charge_amount, discount_amount, penalty_amount,
      subtotal, tax_amount, total_amount, paid_amount, outstanding_amount, status, notes
    ) VALUES (
      'INV-TENANT/202508/00001', b1.tenant_id, b1.id, b1.unit_code,
      '2025-08-01', '2025-08-31', '2025-08-10',
      COALESCE(b1.rent_amount, 0),
      COALESCE(b1.service_charge_amount, 0),
      COALESCE(b1.electricity_charge_amount, 0),
      COALESCE(b1.water_charge_amount, 0),
      0, 0, 0,
      COALESCE(b1.rent_amount,0) + COALESCE(b1.service_charge_amount,0) + COALESCE(b1.electricity_charge_amount,0) + COALESCE(b1.water_charge_amount,0),
      0,
      COALESCE(b1.rent_amount,0) + COALESCE(b1.service_charge_amount,0) + COALESCE(b1.electricity_charge_amount,0) + COALESCE(b1.water_charge_amount,0),
      ROUND((COALESCE(b1.rent_amount,0) + COALESCE(b1.service_charge_amount,0) + COALESCE(b1.electricity_charge_amount,0) + COALESCE(b1.water_charge_amount,0)) * 0.5),
      ROUND((COALESCE(b1.rent_amount,0) + COALESCE(b1.service_charge_amount,0) + COALESCE(b1.electricity_charge_amount,0) + COALESCE(b1.water_charge_amount,0)) * 0.5),
      'partial',
      'Invoice Agustus 2025 - sebagian terbayar'
    );
  END IF;
END $$;
    `.trim(),
  },
  {
    name: "0005_pos_kasir_upgrade",
    sql: `
-- Buat tabel cashier_shifts
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

-- Tambah kolom baru ke tenant_payments
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

-- Tambah kolom receipt_number ke tenant_payments jika belum ada
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
-- 1. Buat tabel mall_sites
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

-- 2. Seed dua site
INSERT INTO "mall_sites" ("code", "name", "type", "status")
VALUES ('TOD_M1_BANDARA', 'TOD M1 Bandara', 'mall_tenant', 'active')
ON CONFLICT DO NOTHING;

INSERT INTO "mall_sites" ("code", "name", "type", "status")
VALUES ('SPORT_CENTER_BANDARA', 'Sport Center Bandara', 'sport_center', 'active')
ON CONFLICT DO NOTHING;

-- 3. Buat tabel user_site_access
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

-- 4a. Tambah site_id ke tenants
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenants' AND column_name='site_id') THEN
    ALTER TABLE "tenants" ADD COLUMN "site_id" integer;
  END IF;
END $$;

-- 4b. Tambah site_id ke tenant_bookings
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_bookings' AND column_name='site_id') THEN
    ALTER TABLE "tenant_bookings" ADD COLUMN "site_id" integer;
  END IF;
END $$;

-- 4c. Tambah site_id ke tenant_invoices
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_invoices' AND column_name='site_id') THEN
    ALTER TABLE "tenant_invoices" ADD COLUMN "site_id" integer;
  END IF;
END $$;

-- 4d. Tambah site_id ke tenant_payments
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_payments' AND column_name='site_id') THEN
    ALTER TABLE "tenant_payments" ADD COLUMN "site_id" integer;
  END IF;
END $$;

-- 4e. Tambah site_id ke mall_units
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='mall_units' AND column_name='site_id') THEN
    ALTER TABLE "mall_units" ADD COLUMN "site_id" integer;
  END IF;
END $$;

-- 4f. Tambah site_id ke audit_logs
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='audit_logs' AND column_name='site_id') THEN
    ALTER TABLE "audit_logs" ADD COLUMN "site_id" integer;
  END IF;
END $$;

-- 4g. Tambah site_id ke cashier_shifts
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cashier_shifts' AND column_name='site_id') THEN
    ALTER TABLE "cashier_shifts" ADD COLUMN "site_id" integer;
  END IF;
END $$;

-- 5. Isi semua data lama dengan TOD_M1_BANDARA
UPDATE "tenants" SET "site_id" = (SELECT id FROM mall_sites WHERE code = 'TOD_M1_BANDARA') WHERE "site_id" IS NULL;
UPDATE "tenant_bookings" SET "site_id" = (SELECT id FROM mall_sites WHERE code = 'TOD_M1_BANDARA') WHERE "site_id" IS NULL;
UPDATE "tenant_invoices" SET "site_id" = (SELECT id FROM mall_sites WHERE code = 'TOD_M1_BANDARA') WHERE "site_id" IS NULL;
UPDATE "tenant_payments" SET "site_id" = (SELECT id FROM mall_sites WHERE code = 'TOD_M1_BANDARA') WHERE "site_id" IS NULL;
UPDATE "mall_units" SET "site_id" = (SELECT id FROM mall_sites WHERE code = 'TOD_M1_BANDARA') WHERE "site_id" IS NULL;
UPDATE "audit_logs" SET "site_id" = (SELECT id FROM mall_sites WHERE code = 'TOD_M1_BANDARA') WHERE "site_id" IS NULL;
UPDATE "cashier_shifts" SET "site_id" = (SELECT id FROM mall_sites WHERE code = 'TOD_M1_BANDARA') WHERE "site_id" IS NULL;

-- 6. Buat NOT NULL pada tabel utama
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
-- 1. Tambah kolom baru ke users (aman, tidak drop data)
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

-- 2. Buat email nullable (untuk user WhatsApp yang tidak punya email)
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;

-- 2b. Tambahkan DEFAULT gen_random_uuid() ke users.id supaya INSERT tanpa id berhasil
DO $$ BEGIN
  IF (SELECT column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'id') IS NULL THEN
    ALTER TABLE "users" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
  END IF;
END $$;

-- 3. Buat tabel tenant_user_access
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

-- 4. Buat tabel otp_tokens
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
-- Tambah kolom avatar_url ke users (kolom ini ada di schema Drizzle tapi belum di DB)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='avatar_url') THEN
    ALTER TABLE "users" ADD COLUMN "avatar_url" text;
  END IF;
END $$;

-- Pastikan order_number di tenant_bookings punya DEFAULT '' agar INSERT tanpa field ini tidak gagal
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
-- Tambah payment_token ke tenant_invoices (link publik untuk upload bukti)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_invoices' AND column_name='payment_token') THEN
    ALTER TABLE "tenant_invoices" ADD COLUMN "payment_token" text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_invoices' AND column_name='last_overdue_reminder_at') THEN
    ALTER TABLE "tenant_invoices" ADD COLUMN "last_overdue_reminder_at" timestamptz;
  END IF;
END $$;

-- Isi payment_token untuk invoice yang sudah ada (gunakan gen_random_uuid)
UPDATE "tenant_invoices" SET payment_token = gen_random_uuid()::text WHERE payment_token IS NULL;

-- Set default untuk row baru
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='tenant_invoices' AND column_name='payment_token'
    AND column_default IS NOT NULL
  ) THEN
    ALTER TABLE "tenant_invoices" ALTER COLUMN "payment_token" SET DEFAULT gen_random_uuid()::text;
  END IF;
END $$;

-- Unique index untuk payment_token
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE tablename = 'tenant_invoices' AND indexname = 'tenant_invoices_payment_token_uq'
  ) THEN
    CREATE UNIQUE INDEX tenant_invoices_payment_token_uq ON "tenant_invoices" ("payment_token") WHERE payment_token IS NOT NULL;
  END IF;
END $$;

-- Tambah kolom approval ke tenant_payments
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
-- Konversi kolom role dari ENUM ke text agar semua nilai role bisa disimpan.
-- Jika sudah text, ALTER TABLE ini diabaikan oleh IF NOT EXISTS check di bawah.
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
];

const MIGRATIONS_TABLE = "schema_migrations";

export async function runMigrations(): Promise<void> {
  const client = new pg.Client({
    connectionString: dbConfig.url,
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
