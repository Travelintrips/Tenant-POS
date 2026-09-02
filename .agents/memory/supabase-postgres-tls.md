---
name: Supabase PostgreSQL TLS on Replit
description: Secure CA handling for Supabase pooler connections when Node rejects the certificate chain.
---

Use Supabase's published Root 2021 CA for PostgreSQL pooler connections and keep
certificate plus hostname verification enabled. Never work around
`SELF_SIGNED_CERT_IN_CHAIN` by disabling certificate verification.

**Why:** In the Replit runtime, Node's default and system CA bundles may not trust
the private Supabase Root 2021 CA. Supabase's published CA matches the root
presented by the pooler and validates the complete chain.

**How to apply:** Use an operator-provided `PGSSLROOTCERT` when present; otherwise
use the bundled public Supabase CA. Confirm its SHA-256 fingerprint against
Supabase's published certificate and test a real database query after changing
TLS configuration.