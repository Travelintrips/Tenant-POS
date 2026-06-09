---
name: Drizzle ORM error code location
description: DrizzleQueryError wraps the actual PostgreSQL error inside .cause; pg error codes (e.g. "23505") are on err.cause.code, not err.code.
---

## Rule
When catching errors from Drizzle ORM queries, the `err.code` on `DrizzleQueryError` is NOT the PostgreSQL SQLSTATE code. The actual PG error is nested at `err.cause`, so the code is at `err.cause.code`.

**Pattern for unique constraint detection:**
```typescript
const isUniqueViolation =
  (err as any)?.code === "23505" ||
  (err as any)?.cause?.code === "23505";
```

**Why:** Without this, retry logic on unique constraint violations (race condition on sequence numbers) silently fails — the error is never recognized as retryable and propagates as a 500.

**How to apply:** Always check both `err.code` and `err.cause?.code` when inspecting PostgreSQL error codes in Drizzle catch blocks.
