---
name: DB connection priority and Supabase env split
description: SUPABASE_PG_URL exists in both 'development' and 'production' Replit env scopes with different project refs; artifact workflow uses the 'development' scope.
---

## Rule
Development and production may use different Supabase projects and credentials. The application
database connection and PostgreSQL session store must use the same environment-aware priority:

- development: `SUPABASE_PG_URL_DEV` → `SUPABASE_PG_URL_PROD` → shared fallbacks
- production: `SUPABASE_PG_URL_PROD` → shared fallbacks

**Why:** A valid development URL can coexist with an invalid or expired production secret. Using
the production URL in development caused database authentication failures; leaving the session
store on the production URL then caused `req.login` to fail even after normal queries recovered.

**How to apply:** When changing database URL precedence, update both `lib/db` and the API
session pool, then restart the workflow so the long-running server reads the new environment.
For production, keep the production secret configured separately and verify its password/project
before deployment.
