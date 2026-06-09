# FINAL LOGIN AUDIT — Mall Admin Portal

Tanggal audit: 9 Juni 2026  
Dilakukan oleh: Replit Agent (manual verification via API + screenshot browser)

---

## 1. Root Cause Login Gagal

**Masalah:** Session cookie yang dikirim API server (`SameSite=None; Secure`) tidak bisa dibaca oleh browser Replit karena frontend berjalan di Vite dev server (port 5000) yang mem-proxy request ke API server (port 8080). Replit menggunakan mTLS reverse proxy/iframe, sehingga cookie dengan flag `Secure` + `SameSite=None` tidak tersimpan dengan benar.

**Solusi yang diterapkan:**

1. **Vite proxy config** (`artifacts/admin-portal/vite.config.ts`) — ditambahkan `configure(proxy)` pada `/api` proxy untuk menulis ulang header `Set-Cookie` dari response API:
   - `SameSite=None` → `SameSite=Lax`
   - Flag `Secure` dihapus

2. **Express session config** (`artifacts/api-server/src/app.ts`) — `cookie.secure` diset `false` agar sesi bisa berjalan tanpa HTTPS di development (Replit proxy menangani TLS di layer atas).

---

## 2. File yang Diubah

| File | Perubahan |
|------|-----------|
| `artifacts/admin-portal/vite.config.ts` | Tambah `configure(proxy)` di `/api` proxy untuk rewrite `Set-Cookie` flags |
| `artifacts/api-server/src/app.ts` | `cookie.secure: false`, `trust proxy: 1` untuk kompatibilitas Replit proxy |

---

## 3. Environment Variables yang Wajib Diset

| Variabel | Keterangan | Wajib? |
|----------|-----------|--------|
| `DATABASE_URL` | PostgreSQL connection string (Replit DB) | ✅ Wajib |
| `SESSION_SECRET` | Secret untuk express-session (min. 32 karakter) | ✅ Wajib di production |
| `PORT` | Port API server (default: 8080) | ✅ Wajib |
| `NODE_ENV` | `development` / `production` | ✅ Wajib |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID | ⚠️ Opsional (Google login) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret | ⚠️ Opsional (Google login) |
| `ENABLE_DEV_LOGIN` | Aktifkan tombol dev login di production | ❌ Jangan diset di production |
| `SUPABASE_URL` | Supabase URL untuk realtime | ❌ Opsional, app jalan tanpanya |
| `SUPABASE_ANON_KEY` | Supabase Anon Key untuk realtime | ❌ Opsional, app jalan tanpanya |

---

## 4. Hasil Backend Test

```
Test Files  10 passed (10)
     Tests  108 passed (108)
  Start at  13:56:36
  Duration  18.79s
```

**Status: ✅ 108/108 LULUS**

---

## 5. Hasil Manual Verification Per Role

### 5.1 Role: OWNER

| Langkah | Hasil |
|---------|-------|
| Login via `POST /api/auth/dev-login` `{"role":"owner"}` | ✅ `200 OK` |
| `/api/auth/me` → email | ✅ `owner@mall.local` |
| `/api/auth/me` → role | ✅ `owner` |
| Redirect ke `/data-tenant` setelah login | ✅ Halaman muncul (frontend) |
| Logout via `POST /api/auth/logout` | ✅ `{"ok":true}` |
| `/api/auth/me` setelah logout | ✅ `401 Unauthorized` |

### 5.2 Role: ADMIN

| Halaman / Endpoint | HTTP | Hasil |
|-------------------|------|-------|
| Login `{"role":"admin"}` | 200 | ✅ |
| `/api/auth/me` → `admin@mall.local`, `role:admin` | 200 | ✅ |
| `GET /api/tenants` (Data Tenant) | 200 | ✅ Boleh akses |
| `GET /api/bookings` (Booking Tenant) | 200 | ✅ Boleh akses |
| `GET /api/tenant-invoices` | 200 | ✅ Boleh akses |
| `GET /api/laporan/kpi` (Laporan) | 200 | ✅ Boleh akses |
| `GET /api/mall-units` (Tenant POS) | 200 | ✅ Boleh akses |
| Logout | 200 | ✅ |

### 5.3 Role: FINANCE

| Halaman / Endpoint | HTTP | Hasil |
|-------------------|------|-------|
| Login `{"role":"finance"}` | 200 | ✅ |
| `/api/auth/me` → `finance@mall.local`, `role:finance` | 200 | ✅ |
| `GET /api/tenant-invoices` (Invoice) | 200 | ✅ Boleh akses |
| `GET /api/bookings` (Pembayaran) | 200 | ✅ Boleh akses |
| `GET /api/laporan/kpi` (Laporan) | 200 | ✅ Boleh akses |
| `PATCH /api/users/1/role` (ubah role — hanya owner) | **403** | ✅ Ditolak |
| `GET /api/users` (kelola user — hanya owner/admin) | **403** | ✅ Ditolak |
| `GET /api/audit-logs` (hanya owner/admin) | **403** | ✅ Ditolak |
| Logout | 200 | ✅ |

### 5.4 Role: CASHIER

| Halaman / Endpoint | HTTP | Hasil |
|-------------------|------|-------|
| Login `{"role":"cashier"}` | 200 | ✅ |
| `/api/auth/me` → `cashier@mall.local`, `role:cashier` | 200 | ✅ |
| `GET /api/mall-units` (Tenant POS — **BOLEH**) | 200 | ✅ Boleh akses |
| `GET /api/tenants` (Data Tenant — **HARUS DITOLAK**) | **403** | ✅ Ditolak → frontend redirect ke `/unauthorized` |
| `GET /api/bookings` (Booking Tenant — **HARUS DITOLAK**) | **403** | ✅ Ditolak → frontend redirect ke `/unauthorized` |
| `GET /api/audit-logs` (**HARUS DITOLAK**) | **403** | ✅ Ditolak → frontend redirect ke `/unauthorized` |
| `PATCH /api/users/1/role` (**HARUS DITOLAK**) | **403** | ✅ Ditolak |
| `GET /api/users` (**HARUS DITOLAK**) | **403** | ✅ Ditolak |
| Logout | 200 | ✅ |

### 5.5 Unauthenticated (tanpa sesi)

| Endpoint | HTTP | Hasil |
|----------|------|-------|
| `GET /api/auth/me` | **401** | ✅ Ditolak |
| `GET /api/tenants` | **401** | ✅ Ditolak |

---

## 6. Status Google OAuth

**Status: ⚠️ BELUM AKTIF**

Google OAuth sudah terimplementasi di kode (`artifacts/api-server/src/lib/auth.ts`) namun **tidak akan aktif** sampai dua environment variable berikut diset:

```
GOOGLE_CLIENT_ID=<dari Google Cloud Console>
GOOGLE_CLIENT_SECRET=<dari Google Cloud Console>
```

Cara setup:
1. Buka [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Buat OAuth 2.0 Client ID (Web application)
3. Tambahkan Authorized redirect URI: `https://<DOMAIN>/api/auth/google/callback`
4. Set `GOOGLE_CLIENT_ID` dan `GOOGLE_CLIENT_SECRET` di Replit Secrets

Selama belum diset, tombol **"Masuk dengan Google"** di `/login` akan gagal redirect. **Dev login tetap berfungsi normal.**

---

## 7. Catatan Penting: ENABLE_DEV_LOGIN

**Dev login (tombol Pemilik/Admin/Keuangan/Kasir di halaman login) HANYA untuk development dan staging.**

Mekanismenya:

```typescript
// artifacts/api-server/src/routes/auth.ts
const DEV_LOGIN_ENABLED =
  process.env.NODE_ENV !== "production" ||
  process.env.ENABLE_DEV_LOGIN === "true";
```

**Aturan:**

| Environment | Aksi |
|-------------|------|
| Development (`NODE_ENV=development`) | Dev login aktif otomatis ✅ |
| Staging (jika perlu) | Set `ENABLE_DEV_LOGIN=true` secara eksplisit |
| **Production** | **Pastikan `NODE_ENV=production` DAN `ENABLE_DEV_LOGIN` tidak diset / diset `false`** |

> ⚠️ Jika `ENABLE_DEV_LOGIN=true` bocor ke production, siapa saja bisa login sebagai owner tanpa password. Endpoint `/api/auth/dev-login-enabled` akan mengembalikan `{"enabled":true}` dan tombol dev muncul di UI.

---

## 8. Hasil pnpm run typecheck

```
artifacts/admin-portal typecheck: Done
artifacts/api-server typecheck: Done
artifacts/mockup-sandbox typecheck: Done
scripts typecheck: Done
```

**Status: ✅ LULUS (0 error)**

---

## 9. Hasil pnpm run build

```
artifacts/api-server build:  dist/index.mjs  3.0mb ⚡ Done in 2642ms
artifacts/admin-portal build: ✓ 2462 modules transformed — built in 17.86s
```

**Status: ✅ LULUS** (warning chunk size >500kb bukan error, bisa dioptimasi nanti)

---

## 10. Ringkasan Final

### ✅ Login per role berhasil

| Role | Login | Email | Role di Token |
|------|-------|-------|---------------|
| Owner | ✅ | owner@mall.local | owner |
| Admin | ✅ | admin@mall.local | admin |
| Finance | ✅ | finance@mall.local | finance |
| Cashier | ✅ | cashier@mall.local | cashier |

### ✅ Role restriction berhasil

| Restriction | Status |
|-------------|--------|
| Cashier tidak bisa akses `/data-tenant`, `/booking-tenant`, `/audit-logs` | ✅ 403 |
| Finance tidak bisa ubah role user | ✅ 403 |
| Finance tidak bisa akses `/users` dan `/audit-logs` | ✅ 403 |
| Cashier tidak bisa akses `/users` | ✅ 403 |
| Unauthenticated ditolak semua endpoint | ✅ 401 |
| Frontend redirect ke `/unauthorized` jika role tidak cukup | ✅ |

### ✅ Build dan test lulus

| Perintah | Hasil |
|----------|-------|
| `pnpm run typecheck` | ✅ 0 error |
| `pnpm run build` | ✅ Berhasil |
| `pnpm test` | ✅ 108/108 passed |

### ✅ Aman untuk staging

Aplikasi siap untuk staging dengan catatan:
- `DATABASE_URL` sudah diset (Replit PostgreSQL)
- `SESSION_SECRET` sudah diset di Replit Secrets
- Dev login aktif (wajar untuk staging)

### ⚠️ Yang harus dimatikan/diset sebelum production

| Item | Aksi |
|------|------|
| `NODE_ENV` | Set ke `production` |
| `ENABLE_DEV_LOGIN` | Hapus atau set ke `false` (atau biarkan kosong, akan disabled otomatis jika `NODE_ENV=production`) |
| `SESSION_SECRET` | Pastikan sudah diset dengan string acak panjang (min. 32 karakter), bukan nilai default |
| Google OAuth | Set `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` jika ingin login via Google aktif |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | Opsional — isi jika ingin fitur realtime Supabase aktif (app tetap jalan tanpanya) |
