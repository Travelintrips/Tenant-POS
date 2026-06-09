---
name: Vitest Globals in tsconfig
description: How to configure tsconfig for vitest globals across api-server and admin-portal
---

# Vitest Globals in tsconfig

**api-server:** Add `"vitest/globals"` to `compilerOptions.types` array so `beforeAll`/`afterAll` are recognized by tsc without needing explicit imports.

**admin-portal:** Do NOT add vitest globals to types — instead, extend the `exclude` array to cover all test file patterns:
```json
"exclude": ["node_modules", "build", "dist", "**/*.test.ts", "**/*.test.tsx", "src/__tests__/**", "src/test/**"]
```
This prevents `@testing-library/*` and `vitest` missing-module errors from blocking typecheck, since those packages may not be installed as workspace deps.

**Why:** admin-portal has `@testing-library/react` as a devDependency but it may not be resolvable by tsc directly; excluding test files is cleaner than fighting module resolution.
