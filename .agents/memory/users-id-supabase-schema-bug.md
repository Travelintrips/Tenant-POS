---
name: users-id-supabase-schema-bug
description: runUsersIdTextMigration silently skips on Supabase because auth.users.id (uuid) shadows public.users.id check
---

## The Rule
`runUsersIdTextMigration` checks `information_schema.columns WHERE table_name='users'` WITHOUT `table_schema='public'`. On Supabase, `auth.users.id` (uuid) appears first and matches the "already text" guard — leaving `public.users.id` as integer.

**Fix:** Migration 0088 (`0088_users_id_to_text`) in `lib/db/src/migrator.ts` uses a DO block with explicit `data_type IN ('integer','bigint','smallint')` EXISTS check which correctly finds `public.users.id` as integer and converts it, even if `auth.users.id` is uuid.

**Why:** Supabase has a built-in `auth` schema with its own `users` table. Any information_schema query without `table_schema='public'` filter returns rows from BOTH schemas.

**How to apply:** If a fresh Supabase DB shows "invalid input syntax for type integer: uuid-string" on user INSERT, migration 0088 should fix it. Do not re-run `runUsersIdTextMigration` — fix it via a new numbered migration with schema-qualified checks.
