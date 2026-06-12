---
name: API Route Path Prefix
description: Express router mounted at /api — route handlers must NOT include /api/ in their path
---

# API Route Path Prefix

## Rule
Routes inside `artifacts/api-server/src/routes/*.ts` must use paths **without** the `/api/` prefix.

**Why:** In `app.ts`, the main router is mounted with `app.use("/api", router)`. Express strips the `/api` prefix before matching sub-routes. So `router.get("/tenants", ...)` is accessible at `/api/tenants`, but `router.get("/api/tenants", ...)` would require `/api/api/tenants`.

**How to apply:** Always check existing routes (e.g. `tenants.ts` uses `/tenants`, `laporan.ts` uses `/laporan/summary`) when adding new routes. The symptom of getting this wrong is a 404 with ~1000ms response time (siteContext DB query runs, then no route matches).
