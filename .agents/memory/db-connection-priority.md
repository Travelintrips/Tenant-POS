---
name: DB connection priority and split-brain warning
description: lib/db reads SUPABASE_PG_URL before DATABASE_URL; psql $DATABASE_URL hits local Postgres, running API uses Supabase.
---

## Rule
`lib/db/src/config.ts` prioritises `SUPABASE_PG_URL` → `SUPABASE_DATABASE_URL` → `DATABASE_URL`.
The running API server therefore uses Supabase when `SUPABASE_PG_URL` is set in the environment.

**Why:** `SUPABASE_PG_URL` (pooler, port 6543) is reachable from the Replit sandbox at runtime and is the primary production-like database. `DATABASE_URL` points to the local Replit Postgres, which is only used as a fallback when Supabase env vars are absent.

**Split-brain risk:** `psql "$DATABASE_URL"` in a shell command hits the **local** Postgres, not Supabase. Any seed data inserted via psql $DATABASE_URL will NOT appear in the running API. Always seed via the API (POST endpoints) or run SQL directly against the Supabase pooler URL.

**How to apply:**
- When debugging "tenant/booking not found" errors, check Supabase tenant IDs (starting ≥15 in dev), NOT local DB IDs (1-14).
- To check what data the running API sees, use the API itself (curl /api/tenants) rather than psql.
- To seed Supabase data, use API endpoints or run migrations via lib/db/src/migrator.ts.
- drizzle-kit push may hang on the pooler — use the migrator script instead.
