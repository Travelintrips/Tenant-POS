# WhatsApp Login — Panduan

## Cara Login WhatsApp

1. Buka halaman login
2. Masukkan nomor WhatsApp (08xxx atau +628xxx atau 628xxx)
3. Klik **Kirim Kode OTP**
4. Masukkan 6 digit OTP yang diterima via WhatsApp
5. Klik **Verifikasi & Masuk**
6. Jika role `tenant_user` → diarahkan ke `/tenant-portal`
7. Jika role lain (owner/admin/finance/cashier) → diarahkan ke admin portal

## Environment Variables yang Dibutuhkan

| Variabel | Keterangan | Default |
|---|---|---|
| `ENABLE_WHATSAPP_LOGIN` | Aktifkan login WhatsApp | `true` (otomatis) |
| `OTP_EXPIRY_MINUTES` | Durasi OTP berlaku (menit) | `5` |
| `OTP_MAX_ATTEMPTS` | Maks percobaan OTP salah | `5` |
| `CST_WA_GATEWAY_TOKEN` | API Key CST WA Gateway untuk production | — |
| `CST_WA_DEVICE_ID` | Nomor pengirim CST WA Gateway (opsional) | — |
| `ENABLE_DEV_LOGIN` | Aktifkan dev mode login | `true` di non-prod |

## Dev Mode

Di lingkungan development (`NODE_ENV !== "production"`):
- Response `POST /api/auth/whatsapp/request-otp` menyertakan `devOtp` di body JSON
- OTP juga tampil di layar login (kotak kuning)
- OTP **tidak** dikirim via WhatsApp

## Production Mode

Di production, set `CST_WA_GATEWAY_TOKEN` untuk mengaktifkan pengiriman OTP via CST WA Gateway.
Jika `CST_WA_GATEWAY_TOKEN` tidak diset, request OTP akan mengembalikan error konfigurasi.

## Cara Aktifkan Provider WhatsApp (CST WA Gateway)

1. Buat API Client khusus Tenant-POS di panel CST WA Gateway.
2. Berikan scope minimal `messages:send` dan `messages:read`.
3. Set secret `CST_WA_GATEWAY_TOKEN=<client_api_key>` di environment Tenant-POS.
4. Set `CST_WA_GATEWAY_URL=https://wa.cstlogistic.co.id`.
5. Opsional: set `CST_WA_DEVICE_ID=<device_id>` jika Tenant-POS harus memakai device tertentu.
6. Jangan menaruh `ADMIN_API_TOKEN` gateway di Tenant-POS.

## Flow OTP

```
Client → POST /api/auth/whatsapp/request-otp
         { phoneNumber: "08123456789" }
         ↓
Server: normalisasi nomor → 628123456789
        cek user di DB
        buat OTP 6 digit → simpan hash SHA256
        kirim via WhatsApp (prod) / tampilkan (dev)
         ↓
Response: { message: "...", devOtp?: "123456" }

Client → POST /api/auth/whatsapp/verify-otp
         { phoneNumber: "08123456789", otp: "123456" }
         ↓
Server: verifikasi hash, cek expiry & attempts
        buat session → req.login()
         ↓
Response: { id, name, phoneNumber, role, tenantAccess? }
```

## Keamanan OTP

- OTP disimpan sebagai **SHA256 hash** (tidak pernah plaintext di DB)
- Expired setelah `OTP_EXPIRY_MINUTES` menit
- Maksimal `OTP_MAX_ATTEMPTS` percobaan salah → OTP dikunci
- OTP tidak bisa digunakan dua kali (ditandai `used_at`)
- Rate limit: 5 request OTP/15 menit per nomor, 20/15 menit per IP
- Rate limit verifikasi: 10/15 menit per IP
- Log audit: `whatsapp_otp_requested`, `whatsapp_login_success`, `whatsapp_login_failed`
- OTP plaintext **tidak pernah di-log**

## Yang Belum Production-Ready

- [ ] Set `CST_WA_GATEWAY_TOKEN` di environment production
- [ ] Set webhook `message.received` untuk company Tenant-POS ke `/api/whatsapp/webhook`
- [ ] Aktifkan `SESSION_SECRET` yang kuat di production
- [ ] Uji outbound, OTP, dan inbound approval melalui CST WA Gateway
