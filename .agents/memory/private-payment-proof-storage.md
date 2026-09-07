---
name: Private payment-proof storage
description: Payment proofs are stored in a private Supabase bucket and must be served through an authenticated backend route.
---

The `payment-proofs` bucket is private. Stored `public` object URLs can misleadingly return `NoSuchBucket` even when the object exists and is downloadable with server credentials. Admin UI must use a same-origin, authenticated backend route that downloads and streams the object.

**Why:** Direct browser use of historical public URLs produced broken images while the underlying proof files remained intact.

**How to apply:** Keep Storage service credentials server-side, authorize proof access for the allowed admin roles, stream with the original content type, and return a clear UI error when retrieval fails.