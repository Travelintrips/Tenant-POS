# Mall Admin Portal

A mall tenant management admin portal (in Indonesian) with three sections: Data Tenant, Booking Tenant, and POS Tenant.

## Run & Operate

- Admin Portal runs on port 5000 (Replit webview) — `PORT=5000 BASE_PATH=/ pnpm --filter @workspace/admin-portal run dev`
- API Server runs on port 8080 — `PORT=8080 pnpm --filter @workspace/api-server run dev`
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, shadcn/ui, Tailwind CSS, wouter (routing), TanStack Query
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/admin-portal/` — React frontend with sidebar layout
  - `src/pages/data-tenant.tsx` — tenant list table
  - `src/pages/booking-tenant.tsx` — lease/booking list
  - `src/pages/tenant-pos.tsx` — POS (point of sale) placeholder
  - `src/components/layout/sidebar-layout.tsx` — main navigation sidebar
- `artifacts/api-server/` — Express 5 API server
- `lib/db/` — Drizzle ORM schema and DB connection
- `lib/api-spec/` — OpenAPI spec (source of truth for API contracts)

## Architecture decisions

- Vite requires PORT and BASE_PATH env vars at startup (not optional)
- Admin portal deployed at path `/` (root) via BASE_PATH env var
- API server at port 8080 (external port 80), proxied under `/api`

## Product

Mall tenant management system:
- **Data Tenant** — view all registered tenants with status (Active/Inactive)
- **Booking Tenant** — view all lease agreements and their status
- **POS Tenant** — tenant map and payment processing (placeholder)

## User preferences

- Selalu gunakan Bahasa Indonesia dalam semua respons kepada pengguna.

## Gotchas

- Always pass `PORT=5000 BASE_PATH=/` when starting the admin portal dev server (port 5000 required for Replit webview)
- Always pass `PORT=8080` when starting the API server
- Workflows are named "Admin Portal" and "API Server"

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
