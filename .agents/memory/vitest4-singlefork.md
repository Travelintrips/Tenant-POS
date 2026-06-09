---
name: Vitest 4 pool configuration
description: Vitest 4 removed poolOptions; singleFork and other options are now top-level in the test config object.
---

## Rule
In Vitest 4, `poolOptions` was removed. All previous `poolOptions.forks.*` settings are now top-level in the `test` config.

**Old (Vitest 3, now broken):**
```typescript
poolOptions: { forks: { singleFork: true } }
```

**New (Vitest 4):**
```typescript
test: {
  pool: "forks",
  singleFork: true,
  // ...
}
```

**Why:** Using the old `poolOptions` syntax in Vitest 4 logs a deprecation warning and the option is ignored — tests run in parallel causing DB race conditions.
