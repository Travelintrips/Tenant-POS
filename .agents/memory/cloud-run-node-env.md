---
name: Cloud Run NODE_ENV override
description: Cloud Run forces NODE_ENV=production regardless of .replit [userenv.production] setting; production env validation must be lenient
---

## Rule
Do NOT use `process.exit(1)` in `validateProductionEnv()` when `SUPABASE_PG_URL_PROD` is missing but `SUPABASE_PG_URL` is available as fallback. Only error (exit) when NO db URL at all is available.

**Why:** Replit Cloud Run overrides `NODE_ENV` to `"production"` at the platform level, ignoring `[userenv.production] NODE_ENV = "development"` in `.replit`. So `validateProductionEnv()` always runs in production Cloud Run containers. If it calls `process.exit(1)` for a missing-but-optional env var, the app exits cleanly with code 1 — port 8080 never opens, healthcheck fails, deploy fails.

The project uses a SINGLE Supabase project for both dev and prod (nzdweipzckfszczzqtuw). `SUPABASE_PG_URL` is set in production env; `SUPABASE_PG_URL_PROD` is not. `lib/db/src/config.ts` already falls back: `SUPABASE_PG_URL_PROD ?? SUPABASE_PG_URL ?? DATABASE_URL`. The validation in `index.ts` must match this lenient behavior.

**How to apply:**
- In `validateProductionEnv()`: warn (not error) when `SUPABASE_PG_URL_PROD` is absent but `SUPABASE_PG_URL` exists.
- Only `errors.push(...)` → `process.exit(1)` when BOTH are missing (genuinely no DB) or when `SESSION_SECRET` is the insecure default.
- Other checks (ENABLE_DEV_LOGIN, whitespace, same-url) remain warnings only.

**Diagnosis:** app starts, logs `[startup] ❌ SUPABASE_PG_URL_PROD tidak diset`, then `exit status 1` immediately. Port never opens. Unlike silent crashes, this one DOES produce log output — check for `artifact process exited with error` in deployment logs.
