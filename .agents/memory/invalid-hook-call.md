---
name: Invalid hook call — avoid generated lib hooks in admin-portal
description: Using generated React Query hooks from @workspace/api-client-react causes "Invalid hook call" due to duplicate React instances.
---
## Rule
Admin-portal pages must use `useQuery` from `@tanstack/react-query` directly with plain `fetch` calls. Never import `useListTenants`, `useListBookings`, or other generated hooks from `@workspace/api-client-react`.

**Why:** The generated hook wrappers in `lib/api-client-react` import `useQuery` from their own copy of react-query, creating a duplicate React/react-query instance at HMR time. Vite `resolve.dedupe` alone is insufficient when the lib is a separate workspace package with its own bundled deps.

**How to apply:** In any admin-portal page that fetches data, write:
```ts
import { useQuery } from "@tanstack/react-query";
const { data } = useQuery({ queryKey: ["tenants"], queryFn: () => fetch("/api/tenants").then(r => r.json()) });
```
