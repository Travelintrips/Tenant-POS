---
name: Replit migration DB lessons
description: Key lessons from migrating this project to Replit's built-in PostgreSQL
---

# Replit Migration DB Lessons

## users.id integer→text conversion
The `runUsersIdTextMigration` check in migrator.ts returns "sudah text" when the table doesn't exist yet (dataType is undefined, which !== "integer", so it skips). On a fresh Replit DB the column IS integer (serial). Fix: run `ALTER TABLE users ALTER COLUMN id TYPE text USING id::text` directly via node pg before restarting the server.

**Why:** The migrator runs migrations in background after server starts; the users.id check runs first before 0002_users_table — so on a blank DB it always skips.

## Seed-data migrations with duplicate keys
Migrations like `0021_sport_center_reseed` and `0022_restore_mall_units` do INSERT without IF NOT EXISTS guards at top level — they fail with duplicate key on re-run. Fix: manually INSERT their names into `schema_migrations` table to mark them as applied (data already seeded by earlier migrations).

**Why:** The migrator stops the entire chain on first error; subsequent migrations never run, leaving columns missing.

## Missing migrations on Replit DB
After switching from Supabase to Replit Postgres, these migrations were missing and needed manual application:
- 0020_users_force_logout_at (force_logout_at column)
- 0021_invoice_due_reminders
- 0024_wa_send_logs
- 0025_tenant_default_prices
- 0026_tenant_contract_dates
- 0027_mall_units_default_rent
- 0028_bank_reconciliation

**How to apply:** Run SQL directly via `node -e "new Pool({connectionString: process.env.DATABASE_URL})"`, then INSERT name into schema_migrations.

## DATABASE_URL on Replit
Replit's built-in Postgres uses `DATABASE_URL` with format `postgresql://postgres:<pass>@helium/heliumdb?sslmode=disable`. The `?sslmode=disable` query param must be stripped when parsing into separate fields for pg.Client config.
