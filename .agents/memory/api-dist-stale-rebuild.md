---
name: API dist stale — contract date columns missing
description: Compiled dist/index.mjs can be missing columns if rebuilt before schema changes; also SUPABASE_PG_URL vs SUPABASE_DATABASE_URL priority matters
---

## The rule
When `lib/db/src/schema/tenants.ts` (or any schema file) gets new columns, `artifacts/api-server/dist/index.mjs` MUST be rebuilt. If the workflow was running when the schema change was committed, the dist is stale and the columns will never be inserted or returned.

**Why:** esbuild bundles all TypeScript (including `lib/db` schema) into `dist/index.mjs` at build time. If the bundle was built before a schema column was added, Drizzle ORM simply doesn't know the column exists — no INSERT, no SELECT, no error.

**How to apply:** After any schema column change, always restart the "Start application" workflow to trigger a rebuild. Verify with `grep -c "column_name" artifacts/api-server/dist/index.mjs`.

## DB config URL priority
`lib/db/src/config.ts` now prioritizes `SUPABASE_DATABASE_URL` over `SUPABASE_PG_URL`:
```
SUPABASE_DATABASE_URL → SUPABASE_PG_URL → DATABASE_URL
```

**Why:** `SUPABASE_PG_URL` uses Session Pooler format without `postgres.` username prefix, causing `(ENOIDENTIFIER) no tenant identifier provided` errors. `SUPABASE_DATABASE_URL` uses `postgres.projectref` format which works correctly.
