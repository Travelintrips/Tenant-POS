---
name: googleapis lazy import
description: top-level import of googleapis causes silent production crash when pnpm symlink is missing; must use lazy require() inside functions
---

## Rule
Never use `import { google } from "googleapis"` at the top level of any file. Always lazy-load it inside the functions that need it.

**Why:** `googleapis` is marked `external` in the api-server esbuild config. A top-level import becomes a `require('googleapis')` call at bundle startup — before pino, express-session, or any other logger is initialized. If the pnpm symlink for googleapis is missing in the production Cloud Run container after `pnpm install --frozen-lockfile`, the `require()` throws `Cannot find module 'googleapis'`. The process crashes immediately with NO stderr output, port 8080 never opens, and Cloud Run health check fails with "port never opened". This is extremely hard to diagnose because there are zero logs.

**How to apply:**
```typescript
// BAD — crashes at bundle startup if googleapis not symlinked
import { google } from "googleapis";

// GOOD — only loads when function is called
type GoogleType = typeof import("googleapis");
let _google: GoogleType["google"] | null = null;
function getGoogleLib(): GoogleType["google"] {
  if (!_google) {
    _google = (require("googleapis") as GoogleType).google;
  }
  return _google;
}
```

The pattern applies to ALL esbuild-external packages that are imported at module top level. Check `artifacts/api-server/build.mjs` `external: [...]` for the full list.

**Diagnosis pattern:** silent crash = port never opens, no app output at all, not even MemoryStore warning from express-session. This means crash happened before any module body code ran (= during external require at bundle init).
