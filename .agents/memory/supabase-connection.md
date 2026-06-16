---
name: supabase-connection
description: Active Supabase project connection details and pg connection fix for dotted usernames
---

# Supabase Connection

## Active project
- Project ref: `nzdweipzckfszczzqtuw`
- Pooler host: `aws-1-ap-southeast-2.pooler.supabase.com:6543`
- Secret: `SUPABASE_PG_URL` (pooler, port 6543, transaction mode)

## Config priority (lib/db/src/config.ts)
- Development: `SUPABASE_PG_URL` → `DATABASE_URL`
- Production: `SUPABASE_PG_URL_PROD` → `SUPABASE_PG_URL` → `DATABASE_URL`

## Critical fix: pg username with dots
Supabase pooler usernames have format `postgres.PROJECT_REF` (contains a dot). The `pg` library silently truncates to "postgres" when using `connectionString` if the username contains a dot. 

**Fix**: parse the URL with `new URL()` and pass individual params (`host`, `port`, `user`, `password`, `database`) instead of `connectionString`. This is already implemented in `lib/db/src/config.ts` via `parseDbUrl()`.

**Why**: `new URL("postgresql://postgres.PROJECT_REF:pass@host/db").username` correctly returns `postgres.PROJECT_REF`, but `pg.Client({ connectionString })` drops the `.PROJECT_REF` part in some versions.

**How to apply**: Any time SUPABASE_PG_URL is the active URL, `dbConfig.parsed` will have individual fields instead of `connectionString`. The pool and migrator both spread `dbConfig.parsed` so this is transparent.
