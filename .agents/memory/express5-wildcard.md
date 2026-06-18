---
name: Express 5 wildcard route syntax
description: app.get("*") throws PathError at startup in Express 5; must use "/{*path}" for SPA fallback routes
---

## Rule
Never use `app.get("*", ...)` in Express 5. Use `app.get("/{*path}", ...)` instead.

**Why:** Express 5 switched to path-to-regexp v8 which requires named parameters for wildcards. `"*"` without a name throws `PathError: Missing parameter name at index 0` at route-registration time (not request time), causing the server to crash before it ever starts listening — port never opens, health check probe returns 500 indefinitely.

**How to apply:** Any SPA catch-all route in app.ts or any Express 5 router file must use `"/{*path}"`:
```typescript
// WRONG — crashes at startup in Express 5
app.get("*", (_req, res) => res.sendFile(indexHtml));

// CORRECT — Express 5 / path-to-regexp v8 compatible
app.get("/{*path}", (_req, res) => res.sendFile(indexHtml));
```

Also applies to routers: `router.get("*", ...)` → `router.get("/{*path}", ...)`.

The crash is silent in dev if the static dist folder doesn't exist (the `if (fs.existsSync(...))` block is skipped), so it only surfaces at production deploy time when the built frontend is present.
