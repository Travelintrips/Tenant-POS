---
name: Supabase Storage image compression
description: Image uploads are normalized centrally and legacy objects are rewritten in place to preserve URLs.
---

All server-side image uploads must pass through the shared Storage upload helper, which converts supported images to WebP and leaves PDFs/HTML untouched.

**Why:** Image URLs are stored in database records and sent in notifications, so replacing legacy objects at the same path avoids a broad URL/data migration.

**How to apply:** Use the production-only batch command in preview mode first; apply mode updates only valid, non-animated images whose WebP output is smaller. The batch must tolerate corrupt/empty legacy objects, and a Storage `update` failure can be retried with `upload(..., upsert:true)` at the same path.