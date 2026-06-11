---
name: artifact-workflow-port-conflict
description: Replit artifact system auto-creates workflows that conflict with "Start application" on port 8080. Let artifact workflow own port 8080; Start application runs admin portal only.
---

# Artifact Workflow Port Conflict

Replit auto-creates separate workflows per artifact (`artifacts/api-server: API Server`, `artifacts/admin-portal: web`). These cannot be deleted or reconfigured — they are managed by the artifact system.

**Problem:** `artifacts/api-server: API Server` auto-restarts and reclaims port 8080 in milliseconds. Any attempt by "Start application" to kill port 8080 (via `fuser -k`) and then start the API server races against the artifact workflow restarting and rebinding the port before the build finishes (~350ms build time).

**Why:** The artifact workflow is a persistent managed process. It detects its process died and immediately restarts, winning the port race every time.

**Solution:** Let the artifact workflow own port 8080 entirely. "Start application" only runs the admin portal on port 5000:
```
PORT=5000 BASE_PATH=/ pnpm --filter @workspace/admin-portal run dev
```
The admin portal Vite proxy forwards `/api` to `localhost:8080` (the artifact api-server). This works because both run in the same container.

**How to apply:** If "Start application" shows EADDRINUSE on port 8080, update it to remove the API server command — leave only the admin portal command above.

Also: `multer` was missing from `api-server/package.json` — it must be explicitly installed (`pnpm --filter @workspace/api-server add multer @types/multer`).
