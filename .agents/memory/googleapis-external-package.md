---
name: googleapis external package
description: googleapis is marked external in esbuild config and must be physically installed in artifacts/api-server/node_modules
---

## Rule
`googleapis` is listed in `artifacts/api-server/build.mjs` under `external: ["googleapis", ...]`. This means it is NOT bundled into `dist/index.mjs` — it must be available at runtime in `node_modules`.

**Why:** If `googleapis` is missing, loading `dist/index.mjs` throws `ERR_MODULE_NOT_FOUND: Cannot find package 'googleapis'`. Because ESM external imports are top-level, this causes the ENTIRE module to fail to load — meaning all routes in ALL routers fail with 404.

**How to apply:** After pnpm install or workspace changes, verify `googleapis` is in `artifacts/api-server/node_modules`. If missing, run `cd artifacts/api-server && pnpm add googleapis`. The symptom is bank-reconciliation routes (and any others importing google-sheets.ts) returning 404 even though the dist file contains the route strings.
