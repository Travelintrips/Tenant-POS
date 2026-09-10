---
name: Supabase payment-proof storage
description: Payment-proof bucket policy and verification behavior for private server-side uploads.
---

Payment-proof Storage must remain private and only be downloaded through authenticated backend routes. The configured bucket may enforce an allowed-MIME policy, so verification files must use a supported proof format such as PNG or PDF.

**Why:** A direct public object URL returned a non-success response while server-side download with the service credential succeeded; an unsupported MIME upload was rejected by the bucket policy.

**How to apply:** Keep upload/download credentials server-side, pass `isPublic: false` for payment proofs, and surface bucket or permission errors without exposing credentials.