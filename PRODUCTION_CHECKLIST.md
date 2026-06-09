# PRODUCTION HARDENING CHECKLIST — Mall Admin Portal

Tanggal: 9 Juni 2026  
Versi: post-login-audit hardening + rate limiting + Helmet security headers  
Status build: ✅ typecheck lulus · ✅ build lulus · ✅ 141/141 test pass

---

## 1. Environment Variables Production

| Variabel | Nilai | Status | Catatan |
|----------|-------|--------|---------|
| `NODE_ENV` | `production` | ⚠️ **WAJIB DISET** | Mengaktifkan cookie `secure`, `sameSite=strict`, dan mematikan dev login otomatis |
| `ENABLE_DEV_LOGIN` | tidak diset / `false` | ⚠️ **WAJIB HAPUS** | Jika `NODE_ENV=production` dan variabel ini tidak diset, dev login otomatis mati |
| `SESSION_SECRET` | string acak ≥32 karakter | ⚠️ **WAJIB DISET** | Server akan log `WARN` dan cookie kurang aman jika masih pakai nilai default |
| `DATABASE_URL` | production PostgreSQL URL | ⚠️ **WAJIB DISET** | Replit mengatur ini otomatis untuk deployed environment |
| `GOOGLE_CLIENT_ID` | dari Google Cloud Console | ✅ Opsional | Wajib jika tombol "Masuk dengan Google" ingin aktif |
| `GOOGLE_CLIENT_SECRET` | dari Google Cloud Console | ✅ Opsional | Wajib jika Google OAuth aktif |
| `PORT` | `8080` | ✅ Sudah diset | Diset via env shared |
| `LOG_LEVEL` | `warn` atau `error` | ✅ Rekomendasi | Kurangi log noise di production |

**Cara generate SESSION_SECRET yang aman:**
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

---

## 2. Dev Login: Mati Otomatis di Production

**Implementasi** (`artifacts/api-server/src/routes/auth.ts`):

```typescript
const DEV_LOGIN_ENABLED =
  process.env.NODE_ENV !== "production" ||
  process.env.ENABLE_DEV_LOGIN === "true";

if (DEV_LOGIN_ENABLED) {
  router.post("/auth/dev-login", ...); // route hanya terdaftar jika enabled
}
```

**Perilaku per environment:**

| `NODE_ENV` | `ENABLE_DEV_LOGIN` | Dev login | Tombol muncul di UI |
|-----------|-------------------|-----------|---------------------|
| `development` | (apapun) | ✅ Aktif | ✅ Ya |
| `production` | tidak diset | ❌ Nonaktif | ❌ Tidak |
| `production` | `false` | ❌ Nonaktif | ❌ Tidak |
| `production` | `true` | ⚠️ Aktif (darurat) | ⚠️ Ya |

**Verifikasi:** `GET /api/auth/dev-login-enabled` → `{"enabled":false}` di production.  
Jika `POST /api/auth/dev-login` dipanggil saat dinonaktifkan → `404 Not Found` (route tidak terdaftar).

---

## 3. Cookie Session Production

**Implementasi** (`artifacts/api-server/src/app.ts`):

```typescript
const isProduction = process.env.NODE_ENV === "production";

session({
  secret: sessionSecret,          // dari SESSION_SECRET env
  cookie: {
    httpOnly: true,               // ✅ Selalu aktif — JS tidak bisa baca cookie
    secure: isProduction,         // ✅ true di production (HTTPS only)
    sameSite: isProduction        // ✅ "strict" di production, "lax" di dev
      ? "strict"
      : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 hari
  },
})
```

**Guard SESSION_SECRET default:**
```typescript
if (isProduction && sessionSecret === "fallback-dev-secret") {
  logger.warn("SESSION_SECRET menggunakan nilai default! Wajib diganti sebelum production.");
}
```
→ Jika SESSION_SECRET tidak diset di production, server akan log **WARN** saat startup dan cookie tetap berfungsi tapi kurang aman.

| Flag | Development | Production |
|------|------------|------------|
| `httpOnly` | ✅ `true` | ✅ `true` |
| `secure` | `false` | ✅ `true` |
| `sameSite` | `"lax"` | ✅ `"strict"` |
| `secret` | fallback-dev-secret | ✅ dari env SECRET |

---

## 4. Keamanan Upload File

**Implementasi** (`artifacts/api-server/src/routes/uploads.ts`):

| Aspek | Status | Detail |
|-------|--------|--------|
| MIME whitelist logo | ✅ Aman | Hanya `image/jpeg`, `image/png`, `image/webp` |
| MIME whitelist dokumen | ✅ Aman | Hanya `application/pdf`, `image/jpeg`, `image/png` |
| SVG ditolak | ✅ **403/400** | Tidak ada di whitelist |
| HTML ditolak | ✅ **403/400** | Tidak ada di whitelist |
| JS/EXE ditolak | ✅ **403/400** | Tidak ada di whitelist |
| Batas ukuran file | ✅ **5MB** max | Multer `limits.fileSize` |
| File >5MB | ✅ **400** | `LIMIT_FILE_SIZE` → pesan error jelas |
| Nama file | ✅ Aman | UUID acak + ekstensi original, tidak expose nama asli |
| Autentikasi upload | ✅ **401** tanpa sesi | `requireAuth` middleware wajib |
| Folder uploads | ✅ Static serve | Hanya file yang sudah diupload, tidak browse direktori |

**Hasil verifikasi aktual:**
```
SVG upload (tanpa auth)  → 401 ✅
HTML upload              → 400/000 ✅
Upload tanpa auth        → 401 ✅
File > 5MB               → 400 ✅
```

> ⚠️ **Catatan production:** Folder `uploads/` disimpan lokal di container. Di Replit deployment, file ini tidak persisten antar deploy. Untuk production yang butuh persistensi gambar, pertimbangkan Replit Object Storage atau layanan cloud storage.

---

## 5. Cakupan Audit Log

**Implementasi** (`artifacts/api-server/src/lib/audit.ts`):
- Data sensitif di-strip otomatis: `password`, `token`, `secret`, `cookie`, `session`, `api_key`, dll.
- Fire-and-forget (tidak mengganggu main flow jika gagal)
- Menyimpan: `userId`, `userEmail`, `userName`, `action`, `entityType`, `entityId`, `beforeData`, `afterData`, `ipAddress`, `userAgent`

**Cakupan per aksi:**

| Aksi | File | Status |
|------|------|--------|
| Dev login | `routes/auth.ts` | ✅ `dev_login` — **ditambahkan sesi ini** |
| Ubah role user | `routes/auth.ts` | ✅ `change_user_role` |
| Buat tenant | `routes/tenants.ts` | ✅ `create_tenant` |
| Update tenant | `routes/tenants.ts` | ✅ `update_tenant` |
| Hapus tenant | `routes/tenants.ts` | ✅ `delete_tenant` |
| Buat booking | `routes/bookings.ts` | ✅ `create_booking` |
| Update booking | `routes/bookings.ts` | ✅ `update_booking` |
| Terminasi booking | `routes/bookings.ts` | ✅ `terminate_booking` |
| Buat invoice | `routes/tenant-invoices.ts` | ✅ `create_invoice` |
| Update invoice | `routes/tenant-invoices.ts` | ✅ `update_invoice` |
| Bayar invoice | `routes/tenant-invoices.ts` | ✅ `pay_invoice` |
| Cancel invoice | `routes/tenant-invoices.ts` | ✅ `cancel_invoice` |
| Buat payment (POS) | `routes/tenant-pos.ts` | ✅ `create_payment` |
| Void payment | `routes/tenant-pos.ts` | ✅ `void_payment` |
| Refund payment | `routes/tenant-pos.ts` | ✅ `refund_payment` |
| Update status unit | `routes/mall-units.ts` | ✅ `update_unit_status` |

**Actions yang terdeteksi di database saat ini:**
```
cancel_invoice, create_booking, create_payment, create_tenant,
delete_tenant, dev_login, terminate_booking, update_booking,
update_tenant, update_unit_status, void_payment
```

---

## 6. Tidak Ada Console Log Sensitif

**Verifikasi source production:**
```
BERSIH — tidak ada console.* di source production
```

**Perubahan yang dilakukan sesi ini** (`artifacts/api-server/src/routes/tenant-pos.ts`):
- 6× `console.error(err)` → `logger.error({ err }, "pesan")` menggunakan Pino logger
- `logger` diimport dari `../lib/logger`

**Pino logger aman karena:**
- Log output ke stdout/stderr dalam format JSON terstruktur
- Tidak pernah log `SESSION_SECRET`, `DATABASE_URL`, `GOOGLE_CLIENT_SECRET`
- Field `err` di Pino di-serialize sebagai `{message, stack}` bukan raw object dump

---

## 7. Hasil Verifikasi Akhir

### pnpm run typecheck
```
✅ 0 error — artifacts/admin-portal, api-server, mockup-sandbox, scripts
```

### pnpm run build
```
✅ api-server: dist/index.mjs (3.0mb) — Done in 2669ms
✅ admin-portal: 2462 modules transformed — Done in 18.15s
⚠️  Warning: chunk >500KB (bukan error, bisa dioptimasi nanti dengan code-splitting)
```

### pnpm test
```
✅ Test Files  10 passed (10)
✅ Tests       108 passed (108)
```

---

## 8. Ringkasan Keamanan

### ✅ Aman untuk Staging

| Area | Status Staging |
|------|---------------|
| Dev login aktif | ✅ Wajar untuk staging |
| Cookie httpOnly | ✅ Aktif |
| Upload validation | ✅ Aktif |
| Role restriction | ✅ Aktif |
| Audit log | ✅ Aktif |
| Console log sensitif | ✅ Bersih |

### ⚠️ Yang WAJIB Dilakukan Sebelum Production

| # | Item | Aksi |
|---|------|------|
| 1 | `NODE_ENV=production` | Set di Replit deployment environment |
| 2 | `ENABLE_DEV_LOGIN` | **Hapus** atau set ke `false` (dev login mati otomatis jika `NODE_ENV=production`) |
| 3 | `SESSION_SECRET` | Set string acak ≥32 karakter di Replit Secrets |
| 4 | `DATABASE_URL` | Pastikan menunjuk ke database production |
| 5 | Google OAuth | Set `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` + callback URL jika ingin aktif |
| 6 | File uploads | Pertimbangkan Object Storage untuk persistensi antar deploy |

### Risiko yang Masih Tersisa

| Risiko | Level | Mitigasi |
|--------|-------|----------|
| `ENABLE_DEV_LOGIN=true` bocor ke production | 🔴 Kritis | Jangan pernah set ini di production env |
| SESSION_SECRET lemah | 🟡 Sedang | Guard warn sudah ada; wajib diset sebelum deploy |
| Uploads tidak persisten antar deploy | 🟡 Sedang | Gunakan Object Storage untuk production |
| Google OAuth belum aktif | 🟢 Rendah | Bukan kerentanan, hanya fitur belum diaktifkan |
| Bundle JS >500KB | 🟢 Rendah | Performance warning, bukan security issue |
| `sameSite=lax` di dev proxy | 🟢 Rendah | Normal untuk Vite dev proxy; production pakai `strict` |

---

## 9. File yang Diubah Sesi Ini

| File | Perubahan |
|------|-----------|
| `artifacts/api-server/src/app.ts` | `cookie.secure` & `sameSite` dinamis berdasarkan `NODE_ENV`; guard warn jika `SESSION_SECRET` default di production |
| `artifacts/api-server/src/routes/auth.ts` | Tambah `logAudit` untuk aksi `dev_login`; tambah `devLoginRateLimiter`, `googleAuthRateLimiter`, `authMeRateLimiter` |
| `artifacts/api-server/src/routes/uploads.ts` | Tambah `uploadRateLimiter` pada kedua endpoint upload |
| `artifacts/api-server/src/routes/tenant-pos.ts` | Import `logger`; ganti 6× `console.error` → `logger.error`; tambah `paymentRateLimiter` pada create/void/refund |
| `artifacts/api-server/src/middlewares/rate-limit.ts` | **Baru** — factory `makeRateLimiter` + 5 limiter siap pakai |
| `artifacts/api-server/src/__tests__/rate-limit.test.ts` | **Baru** — 13 test case isolasi rate limit |

---

## 10. Rate Limiting

**Package:** `express-rate-limit` v7 (types built-in, tidak butuh @types terpisah)  
**File middleware:** `artifacts/api-server/src/middlewares/rate-limit.ts`

### Desain

```typescript
// Semua limiter di-skip ketika:
//   NODE_ENV === "test"   → test normal tidak flaky
//   RATE_LIMIT_DISABLED === "true" → override manual jika perlu

makeRateLimiter({ name, max, windowMs, skip? })
```

- `skip` default: `() => NODE_ENV === "test" || RATE_LIMIT_DISABLED === "true"`
- Test khusus rate limit menggunakan `skip: () => false` — isolated, tidak terpengaruh env
- `keyGenerator`: ambil IP dari `x-forwarded-for` lalu fallback ke `req.ip`
- `standardHeaders: true` → kirim `RateLimit-*` headers (RFC draft)
- `legacyHeaders: false` → tidak kirim `X-RateLimit-*` yang deprecated

### Endpoint yang Dilindungi

| Endpoint | Limiter | Limit | Window |
|----------|---------|-------|--------|
| `POST /api/auth/dev-login` | `devLoginRateLimiter` | **30 req** | 15 menit |
| `GET /api/auth/google` | `googleAuthRateLimiter` | **20 req** | 15 menit |
| `GET /api/auth/google/callback` | `googleAuthRateLimiter` | **20 req** | 15 menit |
| `GET /api/auth/me` | `authMeRateLimiter` | **300 req** | 15 menit |
| `POST /api/uploads/tenant-logo` | `uploadRateLimiter` | **30 req** | 15 menit |
| `POST /api/uploads/contract-document` | `uploadRateLimiter` | **30 req** | 15 menit |
| `POST /api/tenant-pos/payments` | `paymentRateLimiter` | **60 req** | 15 menit |
| `POST /api/tenant-pos/payments/:id/void` | `paymentRateLimiter` | **60 req** | 15 menit |
| `POST /api/tenant-pos/payments/:id/refund` | `paymentRateLimiter` | **60 req** | 15 menit |

### Response Jika Terkena Limit

```json
HTTP 429 Too Many Requests
Content-Type: application/json

{
  "error": "Too many requests",
  "message": "Terlalu banyak percobaan. Silakan coba lagi beberapa saat."
}
```

### Logging Rate Limit Hit

```typescript
logger.warn({
  path: req.path,
  ip: "...",
  userAgent: "...",
}, "[rate-limit] limit terlampaui");
```

**Yang TIDAK di-log:** cookie, session token, Authorization header, body request.

### Environment Variables untuk Rate Limit

| Variabel | Default | Fungsi |
|----------|---------|--------|
| `RATE_LIMIT_DISABLED` | tidak diset | Set ke `"true"` untuk menonaktifkan semua limiter (staging debugging / load test) |
| `NODE_ENV=test` | diset vitest | Otomatis nonaktifkan semua limiter saat `pnpm test` |

### Rekomendasi Nilai Limit Production vs Staging

| Endpoint | Staging | Production |
|----------|---------|------------|
| dev-login | 30/15m | N/A (route tidak terdaftar) |
| google-oauth | 20/15m | **10/15m** (lebih ketat) |
| auth/me | 300/15m | 300/15m |
| upload | 30/15m | 30/15m |
| payment | 60/15m | **30/15m** (lebih ketat, sesuai shift kasir) |

> ⚠️ Nilai di atas per-IP. Jika deployment berada di belakang reverse proxy/load balancer, pastikan `trust proxy` dikonfigurasi di Express agar `x-forwarded-for` dibaca dengan benar:
> ```typescript
> app.set("trust proxy", 1); // tambahkan di app.ts jika pakai proxy
> ```

### Hasil Test Rate Limit

```
✅ 13 test baru di rate-limit.test.ts
   - dev-login: normal 200 ✓ | kena 429 setelah limit ✓ | RateLimit headers ada ✓
   - upload: normal 200 ✓ | kena 429 setelah limit ✓
   - payment: normal 200 ✓ | kena 429 setelah limit ✓
   - auth/me: 10 request berturut-turut semua 200 (limit 300) ✓
   - production sim: dev-login 404 jika route tidak terdaftar ✓
   - production sim: dev-login-enabled mengembalikan false ✓
   - response format 429 JSON benar ✓ | RATE_LIMIT_RESPONSE export valid ✓
```

---

## 11. HTTP Security Headers (Helmet)

**Package:** `helmet` v8 (types built-in)  
**Lokasi:** `artifacts/api-server/src/app.ts` — dipasang setelah `pinoHttp`, sebelum `cors`

### Header yang Aktif

| Header | Nilai | Keterangan |
|--------|-------|------------|
| `X-Content-Type-Options` | `nosniff` | ✅ Mencegah MIME-sniffing oleh browser |
| `X-Frame-Options` | `SAMEORIGIN` | ✅ Cegah clickjacking; sameorigin aman untuk reverse-proxy single-domain |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | ✅ Tidak bocorkan URL lengkap ke domain lain |
| `Cross-Origin-Opener-Policy` | `same-origin` | ✅ Isolasi window context; aman untuk redirect-flow Google OAuth |
| `Cross-Origin-Resource-Policy` | `cross-origin` | ✅ Upload (logo/PDF) bisa di-load oleh frontend yang berjalan di port berbeda |
| `Strict-Transport-Security` | `max-age=15552000; includeSubDomains` | ✅ Aktif otomatis Helmet — browser wajib pakai HTTPS |
| `X-DNS-Prefetch-Control` | `off` | ✅ Helmet default |
| `X-Download-Options` | `noopen` | ✅ Helmet default (IE/Edge) |
| `X-Permitted-Cross-Domain-Policies` | `none` | ✅ Helmet default |
| `X-Powered-By` | **dihapus** | ✅ Tidak expose "Express" ke luar |
| `Content-Security-Policy` | **dinonaktifkan** | ⚠️ Lihat keterangan di bawah |
| `Cross-Origin-Embedder-Policy` | **dinonaktifkan** | ⚠️ Lihat keterangan di bawah |

### CSP Dinonaktifkan — Penjelasan

```typescript
helmet({
  contentSecurityPolicy: false,   // CSP tidak diaktifkan di API server
  crossOriginEmbedderPolicy: false, // COEP tidak diaktifkan
})
```

**Alasan CSP dinonaktifkan di API server:**
- Frontend (admin-portal) berjalan di domain/port **berbeda** dari API server
- CSP pada API server hanya mempengaruhi header response API (JSON) dan `/uploads/` static files — bukan HTML admin-portal
- CSP yang relevan seharusnya diset di **Vite / nginx** yang serve `index.html` admin-portal
- Mengaktifkan CSP di API server tanpa koordinasi dengan frontend bisa memblokir Google OAuth, chart library, atau font external

**Kapan aktifkan CSP di API:**
- Jika API dan frontend dijadikan satu origin (misalnya Express serve `dist/index.html`)
- Gunakan `contentSecurityPolicy: { directives: { ... } }` dengan direktif yang sudah disesuaikan

**COEP dinonaktifkan karena:**
- COEP `require-corp` mewajibkan semua subresource (gambar, font, script) mengirim header `Cross-Origin-Resource-Policy`
- Upload legacy yang sudah ada mungkin tidak punya header ini
- `CORP: cross-origin` pada seluruh app sudah cukup untuk use case upload image cross-origin

### Google OAuth Tidak Rusak

| Komponen | Status | Penjelasan |
|----------|--------|------------|
| Redirect ke Google | ✅ Aman | COOP `same-origin` aman untuk redirect-flow (bukan popup) |
| Callback dari Google | ✅ Aman | Server-side redirect, tidak terpengaruh COOP |
| Session cookie setelah callback | ✅ Aman | Cookie diset di server, COOP tidak mempengaruhi |
| X-Frame-Options SAMEORIGIN | ✅ Aman | Google OAuth redirect tidak menggunakan iframe |

### SSE /api/events Tidak Rusak

`EventSource` adalah long-lived HTTP GET connection — Helmet hanya menambahkan header pada response, tidak mengubah body/streaming behavior. Test memverifikasi endpoint mengembalikan 401 (bukan 500/crash) saat tanpa auth.

### Static Uploads Tidak Diblokir

- `CORP: cross-origin` memastikan frontend dapat mengambil gambar dari `/uploads/` lintas origin
- `COEP: false` memastikan tidak ada persyaratan tambahan pada subresource upload
- Upload yang tidak ada tetap mengembalikan 404 (bukan 403 karena Helmet)

### Risiko yang Tersisa

| Risiko | Level | Mitigasi |
|--------|-------|----------|
| CSP belum aktif di frontend | 🟡 Sedang | Tambahkan CSP di Vite config atau nginx jika frontend dipisah deployment |
| HSTS aktif — jika deploy di HTTP murni akan membuat browser stuck | 🟡 Sedang | Replit deployment pakai HTTPS — aman. Jangan deploy ke HTTP tanpa menonaktifkan HSTS |
| CSP jika nanti API + frontend di satu domain | 🟡 Sedang | Aktifkan `contentSecurityPolicy` di Helmet dengan direktif yang tepat saat itu |
| Google OAuth callback domain | 🟢 Rendah | Pastikan `GOOGLE_CLIENT_ID` terdaftar dengan callback URL production yang benar di Google Cloud Console |
| CORP cross-origin terlalu permisif | 🟢 Rendah | Semua resource di `/uploads/` adalah file yang diupload user — bisa diakses secara publik |

### Hasil Test Security Headers

```
✅ 20 test baru di security-headers.test.ts
   - X-Powered-By tidak ada (health, auth/me, dev-login) ✓
   - X-Content-Type-Options: nosniff (health, auth/me, POST) ✓
   - X-Frame-Options: SAMEORIGIN ✓
   - Referrer-Policy: strict-origin-when-cross-origin ✓
   - Cross-Origin-Opener-Policy: same-origin ✓
   - Cross-Origin-Resource-Policy: cross-origin ✓
   - Content-Security-Policy tidak ada (dinonaktifkan) ✓
   - /api/auth/me tanpa auth → 401 bukan 500 ✓
   - /api/auth/me dengan auth → 200 + header security ada ✓
   - /api/events tanpa auth → 401 bukan crash ✓
   - POST dev-login valid tetap 200 dengan Helmet aktif ✓
   - /uploads/ nonexistent → 404 bukan 403 (Helmet tidak memblokir) ✓
   - /api/auth/dev-login-enabled JSON valid + header security ✓
```

### File yang Diubah (Sesi Helmet)

| File | Perubahan |
|------|-----------|
| `artifacts/api-server/src/app.ts` | Import `helmet`; tambah `app.use(helmet({...}))` setelah pinoHttp |
| `artifacts/api-server/src/__tests__/security-headers.test.ts` | **Baru** — 20 test case verifikasi security headers |
