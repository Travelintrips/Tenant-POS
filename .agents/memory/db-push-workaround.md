---
name: DB push workaround
description: drizzle-kit push fails from Replit sandbox; use psql with the migration SQL file instead.
---

## Rule
Never run `drizzle-kit push` or `pnpm --filter @workspace/db run push` from a bash tool. It hangs without a TTY.

**Why:** drizzle-kit push is interactive — it prompts for confirmation before applying changes. Without a real TTY, it hangs indefinitely. Additionally, Supabase direct postgres URLs timeout from Replit's outbound network.

**How to apply:** When schema changes are needed:
1. Run `DATABASE_URL=<dummy> pnpm --filter @workspace/db exec drizzle-kit generate` to produce the SQL file at `lib/db/drizzle/<migration>.sql`.
2. Run the SQL directly: `psql "$DATABASE_URL" -f lib/db/drizzle/<migration>.sql`
3. For Supabase: give the user the SQL file to run in the Supabase SQL editor manually.
