# Mall Admin Portal

A mall tenant management admin portal (in Indonesian) with three sections: Data Tenant, Booking Tenant, and POS Tenant.

## Run & Operate

- Admin Portal runs on port 5000 (Replit webview) — `PORT=5000 BASE_PATH=/ pnpm --filter @workspace/admin-portal run dev`
- API Server runs on port 8080 — `PORT=8080 pnpm --filter @workspace/api-server run dev`
- Both are started together via: `bash scripts/start-dev.sh`
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

## Stack

- pnpm workspaces, Node.js 20, TypeScript 5.9
- Frontend: React + Vite, shadcn/ui, Tailwind CSS, wouter (routing), TanStack Query
- API: Express 5
- DB: PostgreSQL + Drizzle ORM (migrations auto-run at startup)
- Validation: Zod
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/admin-portal/` — React frontend with sidebar layout
  - `src/pages/data-tenant.tsx` — tenant list table
  - `src/pages/booking-tenant.tsx` — lease/booking list
  - `src/pages/tenant-pos.tsx` — POS (point of sale)
  - `src/components/layout/sidebar-layout.tsx` — main navigation sidebar
- `artifacts/api-server/` — Express 5 API server
  - `src/lib/payment-ledger.ts` — Payment Ledger Engine (single source of truth)
  - `src/middlewares/anti-duplicate-payment.ts` — anti-duplikasi referenceId
- `lib/db/` — Drizzle ORM schema and DB connection
  - `src/migrator.ts` — semua migrasi SQL (auto-run at startup)
  - `src/schema/` — table definitions
- `lib/api-spec/` — OpenAPI spec (source of truth for API contracts)

## Architecture decisions

- Vite requires PORT and BASE_PATH env vars at startup (not optional)
- Admin portal deployed at path `/` (root) via BASE_PATH env var
- API server at port 8080 (external port 80), proxied under `/api`
- Payment Ledger: `tenant_payments` table = single source of truth untuk semua pembayaran
- DB priority: `SUPABASE_PG_URL_PROD` → `SUPABASE_PG_URL` → `DATABASE_URL`

## Product

Mall tenant management system:
- **Data Tenant** — view all registered tenants with status (Active/Inactive)
- **Booking Tenant** — view all lease agreements and their status
- **POS Tenant** — tenant map and payment processing
- **Payment Ledger** — semua pembayaran (POS/OCR/bank/manual) terintegrasi via `recordPayment()`

---

## 🔑 Secrets & Environment Variables

> **PENTING untuk rekan tim:** Semua secret wajib dikonfigurasi di tab **Secrets** Replit sebelum menjalankan proyek.
> Nilai-nilai ini bersifat rahasia — jangan pernah commit ke Git.

### Wajib (Mandatory)

| Secret | Keterangan |
|--------|-----------|
| `SUPABASE_PG_URL_PROD` | PostgreSQL URL dari Supabase (production project). Format: `postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres` |
| `SESSION_SECRET` | String acak panjang untuk enkripsi session Express. Generate dengan: `openssl rand -hex 32` |

### Database Fallback (jika tidak pakai Supabase)

| Secret | Keterangan |
|--------|-----------|
| `DATABASE_URL` | PostgreSQL connection string lokal atau Replit managed DB. Otomatis tersedia di Replit. |
| `SUPABASE_PG_URL` | PostgreSQL URL dari Supabase project sekunder (opsional fallback). |

### WhatsApp / OTP (Fonnte)

| Secret | Keterangan |
|--------|-----------|
| `FONNTE_API_KEY` | API key dari [fonnte.com](https://fonnte.com) untuk kirim OTP & notifikasi WA. |
| `OTP_BYPASS_TOKEN` | Token bypass OTP untuk development/testing (opsional). |
| `ADMIN_WHATSAPP` | Nomor WA admin untuk notifikasi pembayaran (format: `628xxx`). |

### Google Sheets Integration

| Secret | Keterangan |
|--------|-----------|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | JSON credentials dari Google Cloud Service Account. Diperlukan untuk fitur sinkronisasi Google Sheets bank rekonsiliasi. Format: JSON object `{"type":"service_account","project_id":"...","private_key":"...","client_email":"..."}` |
| `GOOGLE_SPREADSHEET_ID` | ID spreadsheet Google Sheets untuk rekonsiliasi bank (ambil dari URL spreadsheet). |

### Supabase Storage (Bukti Pembayaran / Upload)

| Secret | Keterangan |
|--------|-----------|
| `SUPABASE_URL` | URL project Supabase. Format: `https://[ref].supabase.co` |
| `SUPABASE_ANON_KEY` | Anon/public key dari Supabase (untuk client-side). |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key Supabase (untuk server-side upload). **Jaga kerahasiaannya.** |
| `SUPABASE_STORAGE_BUCKET` | Nama bucket Supabase Storage untuk menyimpan bukti pembayaran (contoh: `payment-proofs`). |

### Aplikasi

| Secret | Keterangan |
|--------|-----------|
| `APP_URL` | Base URL aplikasi (contoh: `https://nama-repl.replit.app`). Dipakai untuk generate link pembayaran WA. |
| `ENABLE_DEV_LOGIN` | Set `true` untuk mengaktifkan tombol login cepat (Pemilik/Admin/Kasir) di halaman login — **hanya untuk development**. |
| `NODE_ENV` | `development` atau `production`. Biasanya di-set otomatis oleh Replit. |

### OTP Provider Lanjutan (Opsional)

| Secret | Keterangan |
|--------|-----------|
| `OTP_PROVIDER` | Provider OTP: `fonnte` (default) atau `mock` (untuk testing tanpa WA). |
| `WA_GATEWAY_URL` | URL custom WA gateway jika tidak pakai Fonnte. |

---

## Setup untuk Rekan Tim (Langkah-langkah)

1. **Fork/buka proyek ini di Replit**
2. **Buka tab Secrets** (ikon kunci di sidebar kiri)
3. **Tambahkan secret-secret di atas** sesuai kebutuhan
   - Minimal wajib: `SUPABASE_PG_URL_PROD` + `SESSION_SECRET` (atau cukup `DATABASE_URL` bawaan Replit jika tidak pakai Supabase — lihat status di bawah)
   - Untuk fitur WA: tambahkan `FONNTE_API_KEY`
   - Untuk Google Sheets: tambahkan `GOOGLE_SERVICE_ACCOUNT_JSON` + `GOOGLE_SPREADSHEET_ID`
   - Untuk upload bukti: tambahkan semua `SUPABASE_*` keys
4. **Jalankan workflow** "Start application" — migrasi DB akan berjalan otomatis
5. **Login** via tombol DEV MODE di halaman login (jika `ENABLE_DEV_LOGIN=true`)

### Status setup saat ini (re-imported project, 24 Jul 2026)

- **Workflow dikonfigurasi:** `Start application` — `bash scripts/start-dev.sh` (menjalankan API server port 8080 + admin portal port 5000, webview)
- **Dependencies:** `pnpm install` sudah dijalankan, semua paket terinstall.
- **DB terhubung:** `SUPABASE_PG_URL_PROD` sudah di-set → `config.ts` memprioritaskan Supabase. Semua 40+ migrasi terdeteksi `sudah diterapkan` di Supabase.
- **`SESSION_SECRET`** sudah tersedia di Secrets.
- **Dev login** (tombol Pemilik/Admin/Keuangan/Kasir/Tenant User) aktif via `ENABLE_DEV_LOGIN` configuration.
- **Belum dikonfigurasi (opsional, fitur akan gagal tanpa ini):**
  - `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` — upload bukti pembayaran akan gagal tanpa ini.
  - `FONNTE_API_KEY`/`FONNTE_TOKEN` — OTP WhatsApp asli (dev pakai dev-login, jadi tidak wajib untuk development).
  - `GOOGLE_SERVICE_ACCOUNT_JSON` + `GOOGLE_SPREADSHEET_ID` — sinkronisasi rekonsiliasi bank ke Google Sheets.

---

## Gotchas

- Always pass `PORT=5000 BASE_PATH=/` when starting the admin portal dev server (port 5000 required for Replit webview)
- Always pass `PORT=8080` when starting the API server
- Workflow: "Start application" — menjalankan API server (8080) lalu admin portal (5000)
- Migrasi DB berjalan otomatis saat API server start — tidak perlu jalankan manual
- `SUPABASE_PG_URL_PROD` adalah prioritas DB tertinggi; pastikan nilai ini benar sebelum menjalankan

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- Payment Ledger Engine: semua pembayaran masuk lewat `recordPayment()` di `lib/payment-ledger.ts`
- Anti-duplikasi: gunakan middleware `antiDuplicatePayment` di route yang menerima `referenceId` eksternal

## User preferences

- Selalu gunakan Bahasa Indonesia dalam semua respons kepada pengguna.
