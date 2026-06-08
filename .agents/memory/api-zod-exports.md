---
name: api-zod duplicate exports
description: Orval generates both Zod schemas (api.ts) and TypeScript types (types/) with identical names; exporting both causes TS2308.
---
## Rule
`lib/api-zod/src/index.ts` must export ONLY from `./generated/api`, not from `./generated/types`.

**Why:** Orval codegen creates `CreateBookingBody`, `CreateTenantBody`, etc. in both `generated/api.ts` (Zod schemas) and `generated/types/` (TypeScript types). Re-exporting both from the barrel causes TS2308 duplicate identifier errors.

**How to apply:** After any codegen run (`pnpm --filter @workspace/api-spec run codegen`), verify `lib/api-zod/src/index.ts` only has `export * from "./generated/api";`. Remove any `export * from "./generated/types";` line.
