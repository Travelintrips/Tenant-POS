import pg from "pg";

const { Client } = pg;

const connectionString = process.env.SUPABASE_PG_URL;
if (!connectionString) {
  console.error("SUPABASE_PG_URL tidak ditemukan");
  process.exit(1);
}

const client = new Client({ connectionString, connectionTimeoutMillis: 15000 });

const ddl = `
CREATE TABLE IF NOT EXISTS tenants (
  id SERIAL PRIMARY KEY,
  company_id INTEGER,
  user_id INTEGER,
  business_name TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  business_category TEXT,
  logo_url TEXT,
  address TEXT,
  status TEXT NOT NULL DEFAULT 'aktif',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenant_bookings (
  id SERIAL PRIMARY KEY,
  company_id INTEGER,
  order_number TEXT NOT NULL DEFAULT '',
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  user_id INTEGER,
  booking_type TEXT NOT NULL DEFAULT 'sewa',
  start_date DATE,
  end_date DATE,
  duration_months INTEGER,
  requested_area TEXT,
  description TEXT,
  price NUMERIC NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'UNPAID',
  status TEXT NOT NULL DEFAULT 'aktif',
  admin_notes TEXT,
  payment_period_type TEXT NOT NULL DEFAULT 'monthly',
  period_start_month INTEGER,
  period_start_year INTEGER,
  period_end_month INTEGER,
  period_end_year INTEGER,
  total_months INTEGER,
  monthly_price NUMERIC,
  yearly_price NUMERIC,
  total_price NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenant_payments (
  id SERIAL PRIMARY KEY,
  company_id INTEGER,
  tenant_booking_id INTEGER NOT NULL REFERENCES tenant_bookings(id),
  payment_number TEXT,
  proof_image_url TEXT,
  amount NUMERIC NOT NULL,
  method TEXT NOT NULL DEFAULT 'tunai',
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'PAID',
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

try {
  console.log("Menghubungkan ke Supabase...");
  await client.connect();
  console.log("Terhubung! Membuat tabel...");
  await client.query(ddl);
  console.log("✓ Semua tabel berhasil dibuat di Supabase");
} catch (err) {
  console.error("Error:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
