# Tenant Portal — Panduan

## Apa itu Tenant Portal?

Halaman `/tenant-portal` adalah portal khusus untuk **penyewa/kios** (tenant).
Tenant dapat melihat data mereka sendiri tanpa bisa mengakses data tenant lain atau fitur admin.

## Cara Membuat Akun Tenant

1. Login sebagai **Owner** atau **Admin**
2. Buka halaman **Data Tenant**
3. Klik tombol **Akun Tenant** di baris tenant yang ingin dikelola
4. Klik **Tambah User**
5. Isi:
   - Nama lengkap
   - Nomor WhatsApp (digunakan untuk login OTP)
   - Level akses: `owner`, `staff`, atau `viewer`
6. Klik **Simpan**

## Cara Menghubungkan User ke Tenant

User dihubungkan ke tenant melalui tabel `tenant_user_access`:
- 1 user bisa terhubung ke banyak tenant
- 1 tenant bisa punya banyak user
- `site_id` wajib diisi agar data tidak tercampur antar site

### Via API (untuk integrasi)

```bash
POST /api/tenants/:tenantId/users
{
  "name": "Budi Santoso",
  "phoneNumber": "081234567890",
  "accessLevel": "viewer",
  "siteId": 1
}
```

## Aturan Akses Tenant User

| Endpoint | Tenant User |
|---|---|
| `GET /api/tenant-portal/me` | ✅ Hanya data sendiri |
| `GET /api/tenant-portal/bookings` | ✅ Hanya booking tenant sendiri |
| `GET /api/tenant-portal/invoices` | ✅ Hanya invoice tenant sendiri |
| `GET /api/tenant-portal/payments` | ✅ Hanya pembayaran tenant sendiri |
| `GET /api/tenants` | ❌ Diblokir (403) |
| `GET /api/laporan/*` | ❌ Diblokir (403) |
| `GET /api/audit-logs` | ❌ Diblokir (403) |
| `GET /api/users` | ❌ Diblokir (403) |
| `GET /api/bookings` | ❌ Diblokir (403) |

## Level Akses Tenant

| Level | Keterangan |
|---|---|
| `owner` | Pemilik tenant, akses penuh ke data tenant |
| `staff` | Staf tenant |
| `viewer` | Hanya bisa lihat |

*Catatan: saat ini semua level memiliki akses read-only yang sama. Perbedaan level disiapkan untuk pengembangan fase berikutnya.*

## Multi-Site

- Tenant user **hanya** bisa melihat data dari site yang terhubung di `tenant_user_access`
- Sport Center Bandara dan TOD M1 Bandara **tidak bisa saling melihat** data
- `site_id` divalidasi di setiap endpoint tenant portal

## Struktur Data

```
users (role: tenant_user)
  └── tenant_user_access
        ├── user_id → users.id
        ├── tenant_id → tenants.id
        ├── site_id → mall_sites.id
        ├── access_level: owner/staff/viewer
        └── status: active/inactive
```

## Risiko Keamanan

- Jangan biarkan `ENABLE_DEV_LOGIN=true` di production
- Pastikan `SESSION_SECRET` diset kuat di production
- OTP rate limit sudah aktif: 5 request/15 menit per nomor
- Audit log mencatat semua login tenant
