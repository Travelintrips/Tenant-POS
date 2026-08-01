---
name: dev-login production risk
description: Dev-login pernah aktif di production via ENABLE_DEV_LOGIN=true, semua aksi data selama ini dilakukan via akun Dev Owner bukan WA OTP
---

# Dev Login Production Risk

**Temuan (1 Agustus 2026):** `ENABLE_DEV_LOGIN=true` di-set di production env vars, menyebabkan tombol Dev Mode muncul dan bisa dipakai siapapun di tenant.travelintrips.co.id tanpa OTP.

**Dampak:** Semua create_payment, approve_payment, delete_invoice, dst. dilakukan lewat "Dev Owner" (bukan akun nyata ber-OTP). Aksi "tidak sengaja" (Bayar Tunai ke invoice salah) adalah human error oleh pengguna yang terbiasa dev-login.

**Fix diterapkan:**
- `DEV_LOGIN_SECRET=fVlb7LltnHmEySKb` ditambah ke production env → dev-login sekarang wajib password
- Frontend: field "Password Dev" wajib diisi sebelum tombol Pemilik/Admin aktif
- Backend: `if (devLoginSecret && req.body.devSecret !== devLoginSecret) → 401`
- Nomor HP Dev Owner diupdate ke `6282299997227`

**Why:** Tanpa proteksi ini, siapapun yang tahu URL bisa login sebagai Owner dan modifikasi data production.

**How to apply:** Jika dev-login perlu dinonaktifkan penuh di production, hapus `ENABLE_DEV_LOGIN` dari production env vars. Password saat ini: `fVlb7LltnHmEySKb` (ada di env vars production, bukan hardcoded).
