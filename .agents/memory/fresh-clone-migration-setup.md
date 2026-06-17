---
name: fresh-clone-migration-setup
description: Steps to fix migrator.ts syntax errors and skip conflicting seed migrations on a fresh Replit clone
---

# Fresh Clone Migration Setup

## Problem
On a fresh clone, `lib/db/src/migrator.ts` has syntax errors — SQL template literals not properly closed (missing `);` + closing backtick + object close `},` before the next migration's `name:` field). Also `lib/db/src/config.ts` may have duplicate `const rawUrl` declarations from a merge conflict.

## Fix for config.ts
Always use `resolveDbUrl()` function style — no nested ternary, no duplicate const declarations. Overwrite the whole file with the write tool.

## Fix for migrator.ts syntax errors
Look for patterns where a migration's SQL ends but has no closing:
```
  "created_at" timestamptz NOT NULL DEFAULT now()
    name: "0031_system_settings_table",   ← missing ); ` }, { before this
```
Fix by inserting:
```
  "created_at" timestamptz NOT NULL DEFAULT now()
);
    `.trim(),
  },
  {
    name: "0031_system_settings_table",
```

## Seed migrations to skip (mark as applied before running migrate)
These migrations fail with duplicate key errors on a fresh DB that already has data:
- `0022_restore_mall_units`
- `0021_sport_center_reseed`
- `0031_fix_mall_units_constraint_and_kantin`
- Any other seed inserts that reference existing unit_code values

**How:**
```sql
INSERT INTO schema_migrations (name) VALUES ('0022_restore_mall_units'), ('0021_sport_center_reseed'), ('0031_fix_mall_units_constraint_and_kantin') ON CONFLICT DO NOTHING;
```

**Why:** These are data-seed migrations (INSERT statements) that fail if data already exists from earlier migrations. The schema changes they contain are applied by other migrations.
