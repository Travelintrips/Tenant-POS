---
name: Supabase search path
description: Safely setting the public schema across Supabase pooler and direct PostgreSQL endpoints.
---

Set `search_path` with `SET search_path TO public` after a connection is established, and configure session storage with an explicit `schemaName: "public"`. Do not send `-c search_path=public` through PostgreSQL connection startup options.

**Why:** Some Supabase endpoints reject `search_path` as a startup option, preventing authentication and queries even when the database URL and password are valid. Explicit post-connect configuration works without relying on the endpoint accepting startup parameters.

**How to apply:** Keep the pool's connection hook and migration setup responsible for the schema. When a new PostgreSQL client or pool is added, set the schema after connecting rather than adding an `options` field to its connection configuration.