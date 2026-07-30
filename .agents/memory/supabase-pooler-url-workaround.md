---
name: Supabase Pooler URL Workaround
description: Fix DB auth failure when SUPABASE_PG_URL_PROD secret overrides correct production env var
---

## Rule
When SUPABASE_PG_URL_PROD secret has wrong credentials, production env var SUPABASE_PG_URL (correct) is NOT visible in dev-mode workflows — only in deployed (production) environment. Fix: set SUPABASE_POOLER_URL in shared scope via setEnvVars, and put it first in config.ts resolveDbUrl().

**Why:** Secrets available in all envs take priority over production-scoped env vars. Production env vars invisible to dev workflows. Shared env var with new name avoids both conflicts.

**How to apply:**
- `setEnvVars({ values: { SUPABASE_POOLER_URL: correctUrl }, environment: "shared" })`
- config.ts priority: SUPABASE_POOLER_URL → SUPABASE_PG_URL → SUPABASE_PG_URL_PROD → SUPABASE_PG_URL_DEV → DATABASE_URL
- DATABASE_URL is runtime-managed (cannot be set via setEnvVars)
