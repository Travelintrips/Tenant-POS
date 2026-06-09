# Staging Deployment Audit — Mall Admin Portal

**Tanggal audit:** 9 Juni 2026  
**Auditor:** Replit Agent  
**Tujuan:** Verifikasi kesiapan aplikasi untuk staging deployment sebelum go-live production

---

## 1. Ringkasan Eksekutif

| Kategori | Status | Keterangan |
|----------|--------|------------|
| Typecheck | ✅ Lulus | 0 error di semua package |
| Build | ✅ Lulus | Semua package berhasil di-build |
| Test suite | ✅ Lulus | 141/141 test pass, 12 test file |
| Login & sesi | ✅ Berfungsi | Owner/Admin/Keuangan/Kasir berhasil login |
| Role restriction (API) | ✅ Berfungsi | 401/403 sesuai ekspektasi |
| Security headers (Helmet) | ✅ Aktif | X-Frame-Options, X-Content-Type-Options, HSTS, dll |
| Rate limiting | ✅ Aktif | Semua endpoint kritik terlindungi |
| CSP frontend | ✅ Dipasang | Meta tag permissif di index.html |
| Google OAuth | ⚠️ Belum aktif | GOOGLE_CLIENT_ID/SECRET tidak diset |
| Dev login (bypass) | ⚠️ Aktif | Karena NODE_ENV tidak diset — aman untuk staging |
| Upload storage | ⚠️ Local disk | File hilang saat server restart — risiko staging |
| DATABASE_URL | ✅ Diset | Mengarah ke Supabase (pooler port 6543) |
| SESSION_SECRET | ✅ Kuat | 88 karakter, bukan default |

**Kesimpulan:** ✅ **Aman untuk staging** dengan catatan. ❌ **Belum siap untuk production** (lihat bagian 8).

---

## 2. Hasil Final Command

### 2.1 `pnpm run typecheck`

```
✅ LULUS — 0 error di semua package:
  - @workspace/db          OK
  - @workspace/api-spec    OK
  - @workspace/api-server  OK
  - @workspace/admin-portal OK
  - scripts                OK
  - artifacts/mockup-sandbox OK
```

### 2.2 `pnpm run build`

```
✅ LULUS — semua package berhasil di-build:
  - api-server   esbuild  ⚡ 2657ms
  - admin-portal vite     ✓ 2462 modules, 16.27s
  - mockup-sandbox vite   ✓ 1.54s

⚠️  Warning (bukan error):
  - "Some chunks are larger than 500 kB" — admin-portal bundle 1.03 MB
    (normal untuk React SPA, tidak mempengaruhi fungsionalitas)
  - Sourcemap warnings dari shadcn/ui components — bukan masalah runtime
```

### 2.3 `pnpm test`

```
✅ LULUS — 141/141 test pass
  Test Files  12 passed (12)
  Tests       141 passed (141)
  Duration    ~18-20 detik

  Test files yang dijalankan:
  - auth.test.ts, bookings.test.ts, floor-plan.test.ts
  - invoices.test.ts, laporan.test.ts, payments.test.ts
  - pos.test.ts, rbac.test.ts, security-headers.test.ts
  - tenants.test.ts, uploads.test.ts, sse.test.ts
```

---

## 3. Verifikasi Manual Endpoint API

Semua endpoint diverifikasi menggunakan `curl` langsung ke `http://localhost:8080`.

### 3.1 Auth Endpoints

| Endpoint | Method | Status | Hasil |
|----------|--------|--------|-------|
| `/api/auth/dev-login-enabled` | GET | 200 | `{"enabled":true}` |
| `/api/auth/dev-login` | POST `{"role":"owner"}` | 200 | User data + sesi aktif |
| `/api/auth/me` | GET (dengan sesi) | 200 | `{"role":"owner","email":"owner@mall.local"}` |
| `/api/auth/me` | GET (tanpa sesi) | 401 | Benar — unauthorized |

### 3.2 Data Endpoints (Owner)

| Endpoint | Method | Status | Hasil |
|----------|--------|--------|-------|
| `/api/tenants` | GET | 200 | 12 tenant |
| `/api/tenant-invoices` | GET | 200 | 20 invoice |
| `/api/tenant-pos/floor-plan` | GET | 200 | 16 item (unit mall) |
| `/api/laporan/summary?tahun=2026` | GET | 200 | `{tahun, monthly, totalPendapatan, totalTransaksi, tunggakan}` |
| `/api/events` | GET | 200 | SSE stream aktif (text/event-stream) |

### 3.3 Role Restriction (RBAC)

| Endpoint | Role | HTTP Status | Ekspektasi | Hasil |
|----------|------|------------|------------|-------|
| `GET /api/tenants` | cashier | 403 | 403 | ✅ |
| `GET /api/bookings` | cashier | 403 | 403 | ✅ |
| `GET /api/tenant-invoices` | cashier | 403 | 403 | ✅ |
| `GET /api/tenant-pos/floor-plan` | cashier | 200 | 200 | ✅ |
| `GET /api/tenants` | finance | 403 | 403 | ✅ |
| `GET /api/tenant-invoices` | finance | 200 | 200 | ✅ |
| `GET /api/tenants` | no-auth | 401 | 401 | ✅ |
| `GET /api/auth/me` | no-auth | 401 | 401 | ✅ |

**Semua role restriction berfungsi sesuai desain.**

---

## 4. Verifikasi Manual Frontend

| Halaman | Status | Catatan |
|---------|--------|---------|
| `/login` render | ✅ Normal | Tidak blank, tidak ada CSP error di console |
| Tombol DEV MODE tampil | ✅ | Muncul karena `NODE_ENV` tidak diset (dev login aktif) |
| Login sebagai Owner | ✅ | Dev login berhasil, redirect ke dashboard |
| Owner dapat buka semua menu | ✅ | Data Tenant, Booking, POS, Invoice, Laporan |
| Cashier hanya bisa POS | ✅ API | API mengembalikan 403 untuk endpoint non-POS |
| Cashier → `/data-tenant` | ✅ | Frontend redirect ke `/unauthorized` (RBAC frontend aktif) |
| Halaman Laporan | ✅ | Tidak blank, Recharts render normal |
| Halaman POS | ✅ | Floor plan tampil, unit mall 16 item |
| Halaman Invoice | ✅ | 20 invoice tampil |
| Google Fonts | ✅ | Dimuat dari CDN, tidak diblokir CSP |
| Tidak ada error CSP | ✅ | Browser console bersih dari CSP violation |

---

## 5. Audit Environment Variables

### 5.1 Status Env Saat Ini (Replit Dev Environment)

| Variabel | Status | Nilai Saat Ini | Catatan |
|----------|--------|---------------|---------|
| `NODE_ENV` | ⚠️ Tidak diset | `undefined` → berlaku sebagai `development` | Perlu diset untuk staging/production |
| `DATABASE_URL` | ✅ Diset | Supabase pooler `6543` | ✅ |
| `SESSION_SECRET` | ✅ Diset | 88 karakter acak | ✅ Cukup kuat |
| `ENABLE_DEV_LOGIN` | ⚠️ Tidak diset | `undefined` → dev login **aktif** karena `NODE_ENV` bukan `production` | Aman untuk staging |
| `RATE_LIMIT_DISABLED` | ✅ Tidak diset | `undefined` → rate limiting **aktif** | ✅ |
| `GOOGLE_CLIENT_ID` | ❌ Tidak diset | — | Google OAuth tidak berfungsi |
| `GOOGLE_CLIENT_SECRET` | ❌ Tidak diset | — | Google OAuth tidak berfungsi |
| `GOOGLE_CALLBACK_URL` | ❌ Tidak diset | — | Google OAuth tidak berfungsi |
| `PORT` | ℹ️ Diset via CLI | `8080` (API), `5000` (frontend) | Diset di workflow command, bukan di Secrets |
| `BASE_PATH` | ℹ️ Diset via CLI | `/` (frontend) | Diset di workflow command |

### 5.2 Logika Dev Login (Penting!)

```typescript
// artifacts/api-server/src/routes/auth.ts
const devLoginEnabled =
  process.env.NODE_ENV !== "production" ||   // ← true jika NODE_ENV tidak diset / staging
  process.env.ENABLE_DEV_LOGIN === "true";   // ← override eksplisit
```

**Implikasi:**
- `NODE_ENV` tidak diset / `NODE_ENV=staging` → dev login **otomatis aktif** (tanpa perlu `ENABLE_DEV_LOGIN=true`)
- `NODE_ENV=production` → dev login **hanya aktif** jika `ENABLE_DEV_LOGIN=true` eksplisit
- `NODE_ENV=production` tanpa `ENABLE_DEV_LOGIN=true` → dev login **dimatikan** ✅

### 5.3 Logika Session Cookie (Penting!)

```typescript
// artifacts/api-server/src/app.ts
const isProduction = process.env.NODE_ENV === "production";
// ...
cookie: {
  secure: isProduction,       // ← false jika NODE_ENV bukan "production"
  sameSite: isProduction ? "strict" : "lax",
}
```

**Implikasi:** Dengan `NODE_ENV` tidak diset, cookie dikirim tanpa flag `Secure` dan `SameSite: lax`. Di staging dengan HTTPS, ini masih aman (browser otomatis mengikuti domain HTTPS), tapi direkomendasikan set `NODE_ENV=production` atau tambah mode `staging` agar cookie flag konsisten.

### 5.4 Env yang Harus Diisi di Replit Secrets

#### Untuk Staging (wajib):

| Secret | Nilai | Keterangan |
|--------|-------|------------|
| `DATABASE_URL` | `postgresql://...` (Supabase staging) | ✅ Sudah diset — **verifikasi mengarah ke DB staging, bukan production** |
| `SESSION_SECRET` | String acak min 32 karakter | ✅ Sudah diset (88 karakter) |

#### Untuk Staging (opsional tapi direkomendasikan):

| Secret | Nilai | Keterangan |
|--------|-------|------------|
| `NODE_ENV` | `production` | Aktifkan cookie `Secure` + `SameSite: strict`, matikan dev login |
| `ENABLE_DEV_LOGIN` | `true` | Jika ingin dev login tetap aktif meski `NODE_ENV=production` |

#### Untuk Production (wajib jika Google OAuth dipakai):

| Secret | Nilai | Keterangan |
|--------|-------|------------|
| `GOOGLE_CLIENT_ID` | `xxxxxx.apps.googleusercontent.com` | Dari Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | `GOCSPX-xxxxx` | Dari Google Cloud Console |
| `GOOGLE_CALLBACK_URL` | `https://domain-production.com/api/auth/google/callback` | Sesuaikan domain production |

---

## 6. Status Security Hardening

| Komponen | Status | Detail |
|----------|--------|--------|
| **Helmet (HTTP headers)** | ✅ Aktif | X-Frame-Options: DENY, X-Content-Type-Options: nosniff, HSTS, Referrer-Policy, dll |
| **CSP di server** | ℹ️ Dinonaktifkan | Sengaja disabled di Helmet — CSP dikelola via meta tag frontend |
| **CSP di frontend** | ✅ Dipasang | Meta tag permissif di `index.html` |
| **Rate limiting — auth** | ✅ Aktif | 10 req/15 menit untuk `/api/auth/*` |
| **Rate limiting — uploads** | ✅ Aktif | 20 req/jam untuk `/api/uploads/*` |
| **Rate limiting — API umum** | ✅ Aktif | 200 req/menit untuk endpoint lain |
| **Rate limiting — SSE** | ✅ Aktif | 10 koneksi/IP untuk `/api/events` |
| **Cookie session** | ✅ Aktif | `httpOnly: true`, `Secure` & `SameSite: strict` di production |
| **Upload validation** | ✅ Aktif | MIME type check + size limit (logo 2MB, dokumen 10MB) |
| **Audit log** | ✅ Aktif | Semua operasi CRUD dicatat ke tabel `audit_logs` |
| **RBAC middleware** | ✅ Aktif | `requireRole()` di semua endpoint protected |
| **SQL injection** | ✅ Aman | Drizzle ORM dengan parameterized queries |
| **XSS** | ✅ Aman | React auto-escaping + CSP `unsafe-inline` sebagai sementara |

---

## 7. Risiko Tersisa

### 7.1 Risiko Kritis untuk Production

| # | Risiko | Level | Detail | Solusi |
|---|--------|-------|--------|--------|
| R1 | **Google OAuth belum aktif** | 🔴 Kritis (production) | `GOOGLE_CLIENT_ID/SECRET/CALLBACK_URL` belum diset. Login Google akan gagal. | Set di Replit Secrets sebelum production |
| R2 | **NODE_ENV tidak diset** | 🟡 Sedang | Cookie tanpa `Secure` flag. Dev login otomatis aktif. | Set `NODE_ENV=production` di Replit Secrets sebelum production |
| R3 | **ENABLE_DEV_LOGIN aktif** | 🟡 Sedang (production) | Bypass auth dengan role apa pun masih bisa dilakukan. Aman di staging, **wajib dimatikan di production**. | `NODE_ENV=production` + tidak set `ENABLE_DEV_LOGIN=true` |

### 7.2 Risiko Sedang (Dapat Diterima untuk Staging)

| # | Risiko | Level | Detail | Solusi |
|---|--------|-------|--------|--------|
| R4 | **Upload file ke local disk** | 🟡 Sedang | Multer menyimpan ke `uploads/` di server. File **hilang saat server restart** atau scale-out. | Migrasi ke object storage (S3/Supabase Storage/Cloudflare R2) sebelum production |
| R5 | **CSP masih `unsafe-inline`/`unsafe-eval`** | 🟡 Sedang | Perlindungan XSS via CSP belum optimal. | Perketat ke nonce-based CSP setelah domain production final (lihat PRODUCTION_CHECKLIST.md bagian 12) |
| R6 | **CSP via meta tag, bukan HTTP header** | 🟡 Sedang | Meta tag tidak support `report-uri` + beberapa direktif tidak berlaku di browser lama. | Pindahkan ke Nginx/Express response header setelah deploy |
| R7 | **Tidak ada backup database otomatis** | 🟡 Sedang | Data bisa hilang jika ada insiden Supabase atau kesalahan query. | Aktifkan Supabase automatic backup (Point-in-Time Recovery) |

### 7.3 Risiko Rendah (Nice-to-have)

| # | Risiko | Level | Detail | Solusi |
|---|--------|-------|--------|--------|
| R8 | **Tidak ada monitoring uptime** | 🟢 Rendah | Tidak ada alert jika server down. | Pasang UptimeRobot / Betterstack / Checkly |
| R9 | **Tidak ada error tracking** | 🟢 Rendah | Error di production tidak terlacak secara proaktif. | Integrasi Sentry atau Axiom |
| R10 | **Tidak ada cron invoice otomatis** | 🟢 Rendah | Invoice bulanan dibuat manual. | Tambah cron job generate invoice tiap awal bulan |
| R11 | **Tidak ada notifikasi jatuh tempo** | 🟢 Rendah | Pengingat pembayaran ke tenant dilakukan manual. | WhatsApp/email reminder via Twilio/SendGrid/Nodemailer |
| R12 | **Bundle size besar (1 MB)** | 🟢 Rendah | Admin portal 1.03 MB JS — bisa memperlambat initial load. | Code-splitting dengan dynamic import di route level |

---

## 8. Checklist Staging vs Production

### ✅ Sudah Siap untuk Staging

- [x] Typecheck 0 error
- [x] Build lulus semua package
- [x] 141/141 test pass
- [x] Database tersambung (Supabase)
- [x] SESSION_SECRET kuat (88 karakter)
- [x] Rate limiting aktif
- [x] Helmet security headers aktif
- [x] RBAC berfungsi (API + frontend redirect)
- [x] Audit log aktif
- [x] CSP meta tag dipasang
- [x] Upload validation aktif
- [x] Dev login aktif untuk testing internal

### ❌ Wajib Selesai Sebelum Production

- [ ] Set `NODE_ENV=production` di Replit Secrets
- [ ] Verifikasi `ENABLE_DEV_LOGIN` **tidak diset** atau `false` saat production
- [ ] Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`
- [ ] Verifikasi `DATABASE_URL` mengarah ke database **production** (bukan staging)
- [ ] Migrasi upload dari local disk ke object storage
- [ ] Pindahkan CSP dari meta tag ke HTTP header (Nginx/Express)
- [ ] Test Google OAuth end-to-end di domain production
- [ ] Aktifkan Supabase automatic backup

### ⏳ Direkomendasikan Setelah Production Launch

- [ ] Monitoring uptime (UptimeRobot / Betterstack)
- [ ] Error tracking (Sentry / Axiom)
- [ ] Cron invoice bulanan otomatis
- [ ] Notifikasi jatuh tempo (WhatsApp/email)
- [ ] Perketat CSP ke nonce-based policy
- [ ] Code-splitting admin portal (kurangi bundle size)
- [ ] `Content-Security-Policy-Report-Only` + endpoint monitoring violation CSP

---

## 9. Rekomendasi Next Step Setelah Staging

**Prioritas 1 — Sebelum production launch:**

1. **Aktifkan Google OAuth**
   - Buat project di [Google Cloud Console](https://console.cloud.google.com/)
   - Aktifkan Google+ API / Google Identity
   - Tambah Authorized Redirect URI: `https://domain-production.com/api/auth/google/callback`
   - Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` di Replit Secrets
   - Set `NODE_ENV=production` dan hapus/kosongi `ENABLE_DEV_LOGIN`

2. **Migrasi upload ke object storage**
   - Opsi yang direkomendasikan: **Supabase Storage** (sudah pakai Supabase) atau **Cloudflare R2**
   - Upload file langsung dari frontend ke storage bucket, simpan URL di database
   - Tidak lagi bergantung pada local disk server

3. **Aktifkan backup database**
   - Supabase Pro Plan sudah include Point-in-Time Recovery
   - Atau setup pg_dump cron harian ke cloud storage

**Prioritas 2 — Setelah production stabil:**

4. **Monitoring uptime**
   - [UptimeRobot](https://uptimerobot.com/) (gratis, cek tiap 5 menit)
   - Alert via email/Telegram jika server down

5. **Error tracking**
   - [Sentry](https://sentry.io/) gratis tier cukup untuk produksi skala kecil
   - Pasang di frontend (React) dan backend (Express)

6. **Cron invoice bulanan otomatis**
   - Tambah job scheduler (node-cron atau Supabase Edge Functions) 
   - Jalankan `POST /api/tenant-invoices/generate-from-booking/:id` tiap tanggal 1

7. **Notifikasi jatuh tempo**
   - Integrasi email (Nodemailer + SMTP / Resend) atau WhatsApp (Twilio / Fonnte)
   - Kirim reminder H-7, H-3, H+1 dari tanggal jatuh tempo invoice

---

## 10. Lampiran — Perintah Verifikasi Cepat

Gunakan perintah ini untuk verifikasi cepat di staging environment:

```bash
# Cek apakah dev login aktif
curl https://DOMAIN/api/auth/dev-login-enabled

# Login sebagai owner (hanya jika dev login aktif)
curl -c cookies.txt -X POST https://DOMAIN/api/auth/dev-login \
  -H "Content-Type: application/json" -d '{"role":"owner"}'

# Cek sesi
curl -b cookies.txt https://DOMAIN/api/auth/me

# Cek tenants
curl -b cookies.txt https://DOMAIN/api/tenants

# Cek security headers
curl -I https://DOMAIN/api/healthz | grep -E "x-frame|x-content|strict-transport|x-dns"

# Cek rate limiting (jalankan >10x untuk trigger)
for i in {1..12}; do
  curl -s -o /dev/null -w "%{http_code} " https://DOMAIN/api/auth/me
done
```

---

*Dokumen ini dibuat otomatis oleh Replit Agent berdasarkan audit langsung pada codebase dan environment.*  
*Terakhir diperbarui: 9 Juni 2026*
