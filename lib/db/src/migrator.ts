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
