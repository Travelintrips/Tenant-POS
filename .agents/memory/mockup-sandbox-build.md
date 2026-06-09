---
name: Mockup Sandbox Build Fix
description: mockup-sandbox vite.config.ts requires PORT/BASE_PATH env vars but throws during vite build
---

# Mockup Sandbox Build Fix

**Rule:** Gate the PORT/BASE_PATH throws with `process.argv.includes("build")` so `vite build` works without env vars.

**Why:** The vite.config.ts validated PORT and BASE_PATH at config-load time (top-level throw). During `pnpm run build` (called by root build script), no PORT is set, so vite build crashed before even starting. The PORT is only needed at dev/preview server start, not during static asset compilation.

**How to apply:**
```typescript
const isBuild = process.argv.includes("build");
if (!rawPort && !isBuild) { throw ... }
const port = Number(rawPort ?? "3000");
if (!isBuild && (isNaN(port) || port <= 0)) { throw ... }
```
