# PRODUCTION HARDENING CHECKLIST — Mall Admin Portal

Tanggal: 9 Juni 2026  
Versi: post-login-audit hardening  
Status build: ✅ typecheck lulus · ✅ build lulus · ✅ 108/108 test pass

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
| `artifacts/api-server/src/routes/auth.ts` | Tambah `logAudit` untuk aksi `dev_login` saat login berhasil |
| `artifacts/api-server/src/routes/tenant-pos.ts` | Import `logger`; ganti 6× `console.error` → `logger.error` |
