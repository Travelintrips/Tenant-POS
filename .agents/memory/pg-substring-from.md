---
name: PostgreSQL SUBSTRING FROM parameterized
description: SUBSTRING(str FROM $1) with a parameterized integer param is treated as regex extraction in PG, not positional extraction. Always use SUBSTR(str, $1) for positional.
---

## Rule
Never use `SUBSTRING(col FROM ${n})` when `n` is a JavaScript value passed as a Drizzle `sql` parameter. PostgreSQL interprets `SUBSTRING(str FROM pattern)` as regex extraction when the argument is parameterized, silently returning NULL if the pattern doesn't match.

**Use instead:** `SUBSTR(col, ${n})` — unambiguously positional in all PG versions.

**Why:** This bug caused `generateInvoiceNumber()` MAX query to always return NULL → sequence always reset to 1 → unique constraint violation on every second call → 500 response.

**How to apply:** Any time you need to extract a substring by position using Drizzle `sql` template literals, use `SUBSTR(str, pos)` or `SUBSTRING(str, pos)` (comma-separated), never `SUBSTRING(str FROM param)`.
