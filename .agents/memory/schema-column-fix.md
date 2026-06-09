---
name: Schema column mismatch fix
description: Routes and frontend referenced columns that didn't exist in DB schema — resolution approach and data sync needed
---

## The rule
When routes/frontend reference a column that doesn't exist in the Drizzle schema, Drizzle throws a TypeError at query-build time (not at runtime SQL), causing 500 errors that are hard to trace. Always verify schema columns match what routes select/insert.

## Columns added to each table
- `tenants`: `category`, `booth_number`, `area_name`
- `tenant_bookings`: `booking_status`, `total_amount`, `paid_amount`, `remaining_amount`, `due_date`, `period_label`
- `tenant_payments`: `booking_id` (FK), `tenant_id` (FK), `payment_method`, `payment_status`, `receipt_number`, `discount_amount`, `penalty_amount`

Note: `tenant_payments` keeps both `tenant_booking_id` (original, now nullable) and new `booking_id`. After adding `booking_id`, run: `UPDATE tenant_payments SET booking_id = tenant_booking_id WHERE booking_id IS NULL`.

## Why
Routes (`tenant-pos.ts`, `laporan.ts`, `bookings.ts`) were written against an extended schema that was never pushed to DB. The minimal DB schema was out of sync with application code.

## How to apply
If adding a new FK column to an existing table with data, make it nullable first. After migration, run a data-sync SQL to backfill from the old column name. Use the `lib/db/` direct pg script pattern (not drizzle-kit push) to apply schema changes to Supabase.
