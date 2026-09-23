---
name: DB connection priority and Supabase env split
description: Environment-scoped Supabase URLs can coexist with a stale shared production secret; connection priority must match the deployment environment.
---

## Rule
Development and production may use different Supabase projects and credentials. The application
database connection and PostgreSQL session store must use the same environment-aware priority:

- development: `SUPABASE_PG_URL_DEV` → `SUPABASE_PG_URL_PROD` → shared fallbacks
- production: production-scoped `SUPABASE_PG_URL` → shared `SUPABASE_PG_URL_PROD` → shared fallbacks

**Why:** A valid environment-scoped production URL can coexist with an invalid or expired
shared secret. Prioritizing the shared secret made every login path fail because both user
lookups and PostgreSQL session writes depend on the same database connection.

**How to apply:** When changing database URL precedence, update `lib/db` and the API startup
validation together, force `NODE_ENV=production` in the production start command, then restart
the server so the long-running process reads the new environment.
