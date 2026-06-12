---
name: Supabase full connection
description: How all Supabase integrations (DB, Auth, Storage) are wired up and key gotchas
---

## Rule
All Supabase env vars live in the **development** environment (not shared, not secrets):
- `SUPABASE_PG_URL` — transaction pooler port 6543, password is URL-encoded (use `decodeURIComponent` before raw `pg.Pool`)
- `SUPABASE_DATABASE_URL` — session pooler port 5432 (for drizzle-kit)
- `SUPABASE_URL` — project URL `https://nzdweipzckfszczzqtuw.supabase.co`
- `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — injected into frontend by Vite

## DB priority in lib/db/src/config.ts
`SUPABASE_PG_URL` → `SUPABASE_DATABASE_URL` → `SUPABASE_DATABASE_URL_DEV` → `DATABASE_URL`
`DB_URL_OVERRIDE` was deleted — do NOT re-add it.

## /api/config is a PUBLIC route
Must be mounted BEFORE `requireAuth` in `routes/index.ts`. Returns `supabaseUrl` and `supabaseAnonKey` to frontend.

## Frontend Supabase client
`artifacts/admin-portal/src/lib/supabase.ts` — uses `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` directly (no async fetch needed). `getSupabaseClient()` returns `SupabaseClient | null` synchronously.

## Storage
`artifacts/api-server/src/lib/supabase-storage.ts` — uses `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` via `StorageClient` (not `createClient` — avoids WebSocket error on Node 20).
Buckets: `tenant-logos` (public), `contract-docs` (public), `payment-proofs` (public).

**Why:** SUPABASE_PG_URL password contains `$#` chars — URL-encoded as `%24%23`. Raw `new URL(str)` fails; must use regex match + `decodeURIComponent` for direct connections.

**How to apply:**
- To test raw connection: use regex parse + decodeURIComponent on SUPABASE_PG_URL
- To add new bucket: call `ensureBucket()` in supabase-storage.ts — it auto-creates if missing
- All 28 migrations (0001–0028) are applied on Supabase; migrator runs on every startup
