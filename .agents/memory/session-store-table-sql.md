---
name: connect-pg-simple session table
description: createTableIfMissing:true crashes after esbuild bundle because table.sql is not copied to dist
---

## Rule
In `artifacts/api-server/src/app.ts`, always use `createTableIfMissing: false` for the PgSession store.

**Why:** `connect-pg-simple` reads `table.sql` from a relative path that resolves to `dist/table.sql` after esbuild bundles. esbuild does not copy `.sql` files, so the file doesn't exist → ENOENT → `req.login()` fails with 500 on every login attempt.

**How to apply:**
- Keep `createTableIfMissing: false` in app.ts PgSession config
- Ensure migration `0069_ensure_session_table` exists in migrator.ts so fresh DBs get the session table created before server starts
- If `table.sql` issue resurfaces, alternative fix: copy the file via build.mjs `fs.copyFileSync`
