---
name: tenant-status-mismatch
description: Tenant status values in DB use English ("active"/"inactive") but some queries check for Indonesian ("aktif"). Always use IN clause for tenant status filters.
---

# Tenant Status Value Mismatch

The `tenants` table stores status as English strings (`"active"`, `"inactive"`, `"blacklisted"`) — this is the schema default and what seed data inserts. However, some API route queries were written checking `"aktif"` (Indonesian).

**Why:** Schema defines `TENANT_STATUSES = ["active", "inactive", "blacklisted", "aktif", "kosong", "nonaktif"]` — both Indonesian and English are valid, but seed data uses English values. Queries must handle both.

**How to apply:** Any WHERE clause filtering active tenants should use:
```ts
sql`${tenantsTable.status} IN ('aktif', 'active')`
```
NOT `eq(tenantsTable.status, "aktif")` alone.

Booking `bookingStatus` uses Indonesian ("aktif") consistently — that one is fine with `eq(... "aktif")`.
