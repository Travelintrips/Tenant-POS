import pg from "pg";
import { dbConfig } from "./config";

const MIGRATIONS: { name: string; sql: string }[] = [
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
