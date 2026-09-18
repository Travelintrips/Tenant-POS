---
name: Default site persistence
description: The admin portal derives a default site in React while API requests derive site scope from localStorage
---

When the site provider resolves a default site, it must persist that site's ID before data queries run. The shared API wrapper reads `mall_active_site_id` from localStorage; without a persisted default, the UI can display Sport Center while the backend falls back to its own default site.

**Why:** This mismatch makes site-scoped pages appear empty even when production has records for the site shown in the UI.

**How to apply:** Any site selector/provider that uses a localStorage-backed API header should persist both explicit user selections and the resolved fallback/default selection.