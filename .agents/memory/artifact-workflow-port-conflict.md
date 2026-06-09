---
name: artifact-workflow-port-conflict
description: Replit artifact system auto-creates workflows that conflict with "Start application" on port 8080. Solution is to keep both API + portal in "Start application".
---

# Artifact Workflow Port Conflict

Replit auto-creates separate workflows per artifact (`artifacts/api-server: API Server`, `artifacts/admin-portal: web`). These cannot be deleted or reconfigured — they are managed by the artifact system.

**Problem:** `artifacts/api-server: API Server` tries to bind port 8080, conflicting with the "Start application" workflow which also runs the API on 8080.

**Why:** Both workflows run the same api-server dev command targeting port 8080. Only one can bind the port.

**How to apply:** Keep "Start application" as the authoritative workflow running both services in parallel:
```
PORT=8080 pnpm --filter @workspace/api-server run dev & PORT=5000 BASE_PATH=/ pnpm --filter @workspace/admin-portal run dev
```
The artifact `api-server` workflow will fail with EADDRINUSE — this is expected and harmless. The app works correctly through "Start application".

Also: `multer` was missing from `api-server/package.json` — it must be explicitly installed (`pnpm --filter @workspace/api-server add multer @types/multer`).
