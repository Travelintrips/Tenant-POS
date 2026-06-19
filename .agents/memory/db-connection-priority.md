---
name: DB connection priority and Supabase env split
description: SUPABASE_PG_URL exists in both 'development' and 'production' Replit env scopes with different project refs; artifact workflow uses the 'development' scope.
---

## Rule
`lib/db/src/config.ts` prioritises `SUPABASE_PG_URL` → `SUPABASE_DATABASE_URL` → `DATABASE_URL`.

**Current active credentials (June 2026):**
- `development` env: project ref `xssrfshdrtdfupgqwfdw` (original Supabase project, was paused, resumed) — this is what the artifact API server uses
- `production` env: was pointing to `nzdweipzckfszczzqtuw` (user's new project) — deleted to avoid conflict; if deploying to production, re-add under production scope
- Secret (global): may differ; artifact workflows inherit from the `development` scoped env var, NOT the secret, when both exist

**Why Supabase was paused:** Free tier auto-pauses after sustained inactivity. Resume from Supabase dashboard → Settings → General.

**Why artifact workflow env is sticky:** Artifact workflows (`artifacts/api-server: API Server`) are launched by Replit's workflow runner which injects env at launch time. Killing port 8080 and auto-restarting does NOT guarantee a fresh env injection. To force a fresh env: use `restart_workflow` tool or kill the process by PID directly, then call `restart_workflow`.

**How to apply:**
- If DB auth fails → first check if Supabase project is paused; resume from dashboard
- If secret was recently changed and API still fails → kill API process by PID (`ps aux | grep dist/index.mjs`), then `restart_workflow artifacts/api-server: API Server`
- Do NOT create a 'shared' scoped SUPABASE_PG_URL if 'development' or 'production' scoped ones already exist (Replit blocks it)
- To check what data the running API sees, use the API itself (curl /api/tenants) rather than psql
- drizzle-kit push may hang on the pooler — use the migrator script instead
