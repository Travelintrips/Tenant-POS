---
name: DB connection priority and Supabase env split
description: Environment-scoped Supabase URLs can coexist with a stale shared production secret; connection priority must match the deployment environment.
---

## Rule
Development and production may use different Supabase projects and credentials. The application
database connection and PostgreSQL session store must use the same environment-aware priority:

- development: `SUPABASE_PG_URL_DEV` → `SUPABASE_POOLER_URL` → `DATABASE_URL`
- production: `SUPABASE_PG_URL_PROD` → `SUPABASE_PG_URL` → `SUPABASE_POOLER_URL` → `DATABASE_URL`

**Why:** On 2026-09-24, the user explicitly selected `SUPABASE_PG_URL_PROD` as the production
source after the live login failed while multiple database URL keys were configured. The DB
pool and session store must resolve the same URL or authentication can fail at either lookup
or session persistence.

**How to apply:** When changing database URL precedence, update `lib/db` and the API startup
validation together. Production uses `NODE_ENV=production`; redeploy the external Hostinger
service for source changes to take effect on the live domain.
