---
name: Supabase Storage image compression
description: Image uploads are normalized centrally and legacy objects are rewritten in place to preserve URLs.
---

All server-side image uploads must pass through the shared Storage upload helper, which converts supported images to WebP and leaves PDFs/HTML untouched.

**Why:** Image URLs are stored in database records and sent in notifications, so replacing legacy objects at the same path avoids a broad URL/data migration.

**How to apply:** Use the production-only batch command in preview mode first; apply mode updates only valid, non-animated images whose WebP output is smaller.