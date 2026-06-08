---
name: DB connection priority
description: Supabase postgres is unreachable from Replit dev sandbox; runtime must use DATABASE_URL.
---

## Rule
`lib/db/src/index.ts` must use `DATABASE_URL` (Replit's built-in postgres) for all runtime connections in development. Do NOT fall back to or prioritize `SUPABASE_PG_URL`.

**Why:** `SUPABASE_PG_URL` and `SUPABASE_DATABASE_URL_DEV` both timeout from Replit's outbound network in the sandbox (confirmed by `drizzle-kit push` and direct connection attempts). The built-in `DATABASE_URL` is always reachable.

**How to apply:**
- Keep `lib/db/src/index.ts` using `process.env.DATABASE_URL` only.
- For Supabase in production: the user must manually run the SQL migration (`lib/db/drizzle/0000_dry_madame_web.sql`) in the Supabase SQL editor. Then swap `DATABASE_URL` in the deployment environment to point to Supabase.
