---
name: scripts workspace TypeScript resolution
description: The scripts package cannot resolve @workspace/* libs via node_modules; needs explicit paths in tsconfig.
---
## Rule
`scripts/tsconfig.json` must include a `paths` mapping to resolve `@workspace/db` and any other workspace libs it imports.

**Why:** pnpm does not create `@workspace/*` symlinks in `scripts/node_modules`. Unlike artifacts (admin-portal, api-server), the scripts package has only `tsx` and `@types` in its local node_modules. TypeScript `moduleResolution: bundler` cannot find workspace packages through the pnpm virtual store without explicit path mapping.

**How to apply:**
```json
{
  "compilerOptions": {
    "paths": {
      "@workspace/db": ["../lib/db/src/index.ts"],
      "@workspace/db/schema": ["../lib/db/src/schema/index.ts"]
    }
  },
  "references": [{ "path": "../lib/db" }]
}
```
Add an entry for each `@workspace/*` import used in the seed scripts.
