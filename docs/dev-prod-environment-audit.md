# DEV/PROD Environment Audit Report

**Tanggal:** 2026-06-23
**Status:** ✅ Code fix selesai — ⏳ Secrets menunggu input

---

## 1. Spesifikasi Environment (Verifikasi User)

| Env | Variable | Keterangan |
|-----|----------|------------|
| PROD | `SUPABASE_PG_URL` | PostgreSQL URL Supabase production |
| PROD | `SUPABASE_DATABASE_URL` | Database URL Supabase production |
| PROD | `SUPABASE_URL` | REST/Storage URL Supabase production |
| PROD | `SUPABASE_ANON_KEY` | Anon key Supabase production |
| PROD | `SUPABASE_SERVICE_ROLE_KEY` | Service role key Supabase production |
| DEV | `SUPABASE_PG_URL_DEV` | PostgreSQL URL Supabase development |
| DEV | `SUPABASE_DATABASE_URL_DEV` | Database URL Supabase development |
| DEV | `SUPABASE_URL_DEV` | REST/Storage URL Supabase development |
| DEV | `SUPABASE_ANON_KEY_DEV` | Anon key Supabase development |
| DEV | `SUPABASE_SERVICE_ROLE_KEY_DEV` | Service role key Supabase development |

---

## 2. Audit per Komponen

### 2.1 `lib/db/src/config.ts` — DB Connection (Drizzle ORM)

| NODE_ENV | Variable Digunakan | Fallback | Status |
|----------|-------------------|----------|--------|
| `development` | `SUPABASE_PG_URL_DEV` | `DATABASE_URL` | ✅ Benar |
| `production` | `SUPABASE_PG_URL` | `DATABASE_URL` | ✅ Fixed (was: `SUPABASE_PG_URL_PROD`) |

### 2.2 `lib/db/drizzle.config.ts` — Drizzle Kit

| NODE_ENV | Variable Digunakan | Fallback | Status |
|----------|-------------------|----------|--------|
| `development` | `SUPABASE_PG_URL_DEV` | `DATABASE_URL` | ✅ Fixed (was: flat `SUPABASE_PG_URL \|\| SUPABASE_DATABASE_URL \|\| ...`) |
| `production` | `SUPABASE_PG_URL` | `DATABASE_URL` | ✅ Fixed |

### 2.3 `artifacts/api-server/src/lib/config.ts` — API Server Config

| NODE_ENV | Variable Digunakan | Fallback | Status |
|----------|-------------------|----------|--------|
| `development` | `SUPABASE_DATABASE_URL_DEV` | `DATABASE_URL` | ✅ Fixed (was: flat `DATABASE_URL \|\| SUPABASE_DATABASE_URL`) |
| `production` | `SUPABASE_DATABASE_URL` | `DATABASE_URL` | ✅ Fixed |

### 2.4 `artifacts/api-server/src/lib/supabase-storage.ts` — Supabase Storage

| NODE_ENV | URL Variable | Key Variable | Status |
|----------|-------------|--------------|--------|
| `development` | `SUPABASE_URL_DEV` → `SUPABASE_URL` | `SUPABASE_SERVICE_ROLE_KEY_DEV` → `SUPABASE_SERVICE_ROLE_KEY` | ✅ Sudah benar |
| `production` | `SUPABASE_URL` | `SUPABASE_SERVICE_ROLE_KEY` | ✅ Sudah benar |

### 2.5 `artifacts/api-server/src/routes/config.ts` — Client Supabase Config

| NODE_ENV | URL Variable | Anon Key Variable | Status |
|----------|-------------|-------------------|--------|
| `development` | `SUPABASE_URL_DEV` → `SUPABASE_URL` | `SUPABASE_ANON_KEY_DEV` → `SUPABASE_ANON_KEY` | ✅ Sudah benar |
| `production` | `SUPABASE_URL` | `SUPABASE_ANON_KEY` | ✅ Sudah benar |

### 2.6 `artifacts/api-server/src/index.ts` — `validateProductionEnv()`

| Kondisi | Sebelum | Sesudah | Status |
|---------|---------|---------|--------|
| Prod DB check | `SUPABASE_PG_URL_PROD` → `SUPABASE_PG_URL` → `DATABASE_URL` | `SUPABASE_PG_URL` → `DATABASE_URL` | ✅ Fixed |

### 2.7 `artifacts/admin-portal/src/lib/supabase.ts` — Frontend Supabase Client

| Variable | Keterangan | Status |
|----------|------------|--------|
| `VITE_SUPABASE_URL` | Injected via Vite build-time | ⚠️ Perlu diset di Vite env jika storage/auth frontend dipakai |
| `VITE_SUPABASE_ANON_KEY` | Injected via Vite build-time | ⚠️ Perlu diset di Vite env jika storage/auth frontend dipakai |

> Frontend pakai VITE_ prefix (build-time injection) — berbeda dari server-side vars.

### 2.8 `lib/db/seed.ts` — DB Seed Script

| Variable Digunakan | Keterangan | Status |
|-------------------|------------|--------|
| `SUPABASE_PG_URL` → `SUPABASE_DATABASE_URL` → `DATABASE_URL` | Selalu PROD path (tidak env-aware) | ⚠️ Hanya untuk manual seed, bukan startup |

---

## 3. Secrets Audit — Status di Replit

| Secret | Replit Secrets | Status |
|--------|---------------|--------|
| `SESSION_SECRET` | ✅ Set | ✅ |
| `SUPABASE_PG_URL_PROD` | ✅ Set (legacy name) | ⚠️ Ganti ke `SUPABASE_PG_URL` |
| `DATABASE_URL` | ✅ Set (Replit managed) | ✅ |
| `SUPABASE_PG_URL_DEV` | ❌ Belum set | ⏳ Diminta ke user |
| `SUPABASE_PG_URL` | ❌ Belum set | ⏳ Diminta ke user |
| `SUPABASE_DATABASE_URL_DEV` | ❌ Belum set | ⏳ Diminta ke user |
| `SUPABASE_DATABASE_URL` | ❌ Belum set | ⏳ Diminta ke user |
| `SUPABASE_URL_DEV` | ❌ Belum set | ⏳ Diminta ke user |
| `SUPABASE_URL` | ❌ Belum set | ⏳ Diminta ke user |
| `SUPABASE_ANON_KEY_DEV` | ❌ Belum set | ⏳ Diminta ke user |
| `SUPABASE_ANON_KEY` | ❌ Belum set | ⏳ Diminta ke user |
| `SUPABASE_SERVICE_ROLE_KEY_DEV` | ❌ Belum set | ⏳ Diminta ke user |
| `SUPABASE_SERVICE_ROLE_KEY` | ❌ Belum set | ⏳ Diminta ke user |

---

## 4. Runtime Environment Aktif (saat ini — DEV)

| Komponen | Variable Aktif | Nilai |
|----------|---------------|-------|
| `lib/db/config.ts` | `DATABASE_URL` (fallback, SUPABASE_PG_URL_DEV belum set) | Replit Postgres local |
| `api-server/lib/config.ts` | `DATABASE_URL` (fallback, SUPABASE_DATABASE_URL_DEV belum set) | Replit Postgres local |
| `supabase-storage.ts` | `SUPABASE_URL_DEV` (belum set) → local disk fallback | `/uploads/` |
| `NODE_ENV` | `development` | — |

---

## 5. Validasi Tenant Receipts (DEV — local Replit Postgres)

| Tabel | Row Count | Keterangan |
|-------|-----------|------------|
| `payment_receipts` | **0** | Legacy archive (kosong di local DB) |
| `tenant_receipts` | **0** | Tabel resmi baru (kosong di local DB, akan berisi data saat prod dipakai) |

> ✅ Kedua tabel exist. Row count 0 adalah normal untuk local dev DB yang belum diisi data.

---

## 6. Accounting Tables — Migration 0057

| Tabel | Status |
|-------|--------|
| `companies` | ✅ Migration 0057 ditambahkan |
| `chart_of_accounts` | ✅ Migration 0057 ditambahkan |
| `accounting_journals` | ✅ Migration 0057 ditambahkan |
| `accounting_entries` | ✅ Migration 0057 ditambahkan |
| `accounting_entry_lines` | ✅ Migration 0057 ditambahkan |

Seed data: company `CST`, COA `1-1001` (Kas/Bank) + `4-1010-CST` (Pendapatan Sewa), journal `CSH-CST` + `BNK-CST`.

---

## 7. Langkah Selanjutnya

1. **Tambahkan secrets** yang diminta (10 secrets DEV + PROD) ke Replit Secrets tab
2. **Hapus `SUPABASE_PG_URL_PROD`** setelah `SUPABASE_PG_URL` sudah diset (legacy name tidak lagi dipakai)
3. **Restart workflow** "Start application" setelah secrets diisi — migrator akan buat tabel accounting otomatis
4. **Verifikasi ulang** row count dari `SUPABASE_PG_URL_DEV` (Supabase DEV project)
5. **Baru lanjut** ke Phase 2

---

## 8. Ringkasan Fix yang Diterapkan

| File | Perubahan |
|------|-----------|
| `lib/db/src/config.ts` | PROD: `SUPABASE_PG_URL_PROD` → `SUPABASE_PG_URL` |
| `lib/db/drizzle.config.ts` | Ditambah env-awareness: dev=`SUPABASE_PG_URL_DEV`, prod=`SUPABASE_PG_URL` |
| `artifacts/api-server/src/lib/config.ts` | Ditambah env-awareness: dev=`SUPABASE_DATABASE_URL_DEV`, prod=`SUPABASE_DATABASE_URL` |
| `artifacts/api-server/src/index.ts` | `validateProductionEnv`: cek `SUPABASE_PG_URL` (bukan `SUPABASE_PG_URL_PROD`) |
| `lib/db/src/migrator.ts` | Migration `0057_accounting_double_entry_tables` ditambahkan |
