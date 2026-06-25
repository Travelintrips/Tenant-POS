---
name: migration-0066-legacy-column
description: migration 0066 fails on fresh DB because chart_of_accounts has no legacy 'type' column; fix with DO $$ IF EXISTS column check
---

## Rule
Migration `0066_fix_coa_account_type_backfill` references a legacy `type` column in `chart_of_accounts` that only exists in older databases. On a fresh clone/Replit DB, this column does not exist and the migration fails with `column "type" does not exist`.

**Why:** The migration was written for databases that had a legacy `type` column and needed backfilling. Fresh databases built entirely from migrations never get this column.

**How to apply:** Wrap the UPDATE statements in a `DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='chart_of_accounts' AND column_name='type') THEN ... END IF; END $$;` block so it safely skips on DBs without the legacy column.
