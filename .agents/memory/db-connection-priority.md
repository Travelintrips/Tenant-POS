---
name: DB connection priority and split-brain warning
description: lib/db reads SUPABASE_PG_URL before DATABASE_URL; psql $DATABASE_URL hits local Postgres, running API uses Supabase.
---

## Rule
`lib/db/src/config.ts` prioritises `SUPABASE_PG_URL` → `SUPABASE_DATABASE_URL` → `DATABASE_URL`.
The running API server therefore uses Supabase when `SUPABASE_PG_URL` is set in the environment.

**Why:** `SUPABASE_PG_URL` (pooler, port 6543) is reachable from the Replit sandbox at runtime and is the primary production-like database. `DATABASE_URL` points to the local Replit Postgres, which is only used as a fallback when Supabase env vars are absent.

**Split-brain risk (RESOLVED):** `lib/db/seed.ts` and `lib/db/drizzle.config.ts` previously defaulted to `DATABASE_URL` (local). Both now use the Supabase-first priority chain. All DB connection points now resolve to Supabase when env vars are set.

**Fixed files (June 2026):**
- `lib/db/seed.ts` — uses `SUPABASE_PG_URL ?? SUPABASE_DATABASE_URL ?? DATABASE_URL` + SSL `{rejectUnauthorized:false}` for Supabase
- `lib/db/drizzle.config.ts` — uses `SUPABASE_PG_URL || SUPABASE_DATABASE_URL || SUPABASE_DATABASE_URL_DEV || DATABASE_URL`

**How to apply:**
- Only two files create a raw Pool: `lib/db/src/index.ts` (main) and `lib/db/seed.ts`. Both now use Supabase-first.
- To check what data the running API sees, use the API itself (curl /api/tenants) rather than psql.
- To seed Supabase data, use API endpoints or `scripts/src/seed-demo.ts` (it uses `@workspace/db` which is Supabase-first).
- drizzle-kit push may hang on the pooler — use the migrator script instead.
