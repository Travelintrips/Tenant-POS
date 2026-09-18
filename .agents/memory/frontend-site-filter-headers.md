---
name: Frontend site filter headers
description: Site switching depends on sending the active site header with every site-scoped API request.
---

Use the shared frontend API wrapper for site-scoped requests instead of plain `fetch`. The wrapper reads the active site from local storage and sends `x-site-id` (or `x-site-code: ALL`).

**Why:** The backend defaults to TOD M1 when no site header is present, so a page can appear to ignore Sport Center selection even though the site switcher state changes correctly.

**How to apply:** Include the active site in the query key and use the shared wrapper for list, detail, mutation, and export requests that should follow the selected site.