# Fitur Multi-Site (Multi-Lokasi)

Aplikasi Mall Admin Portal mendukung pengelolaan beberapa lokasi mall (site) dalam satu sistem. Setiap site memiliki data yang terisolasi — tenant, booking, invoice, pembayaran, dan unit mal di satu site tidak terlihat dari site lain.

## Daftar Site yang Ada

| Kode | Nama | Tipe |
|------|------|------|
| `TOD_M1_BANDARA` | TOD M1 Bandara | mall_tenant |
| `SPORT_CENTER_BANDARA` | Sport Center Bandara | mall_tenant |

## Cara Kerja

### Backend — Middleware `siteContext`

Setiap request yang membutuhkan autentikasi melewati middleware `siteContext` (`artifacts/api-server/src/middlewares/site-context.ts`):

1. Baca header `x-site-id` (atau query param `?siteId=`) dari request
2. Validasi bahwa user memiliki akses ke site tersebut (via tabel `user_site_access`)
3. Set `req.siteId` (integer) yang digunakan semua route untuk memfilter data
4. Jika tidak ada header site, fallback ke site default (`TOD_M1_BANDARA`, id sesuai DB)
5. Jika tabel sites belum terisi, `req.siteId = 0` dan filter tidak diterapkan (backward compat)

### Frontend — Context `SiteProvider`

`SiteProvider` (`artifacts/admin-portal/src/contexts/site-context.tsx`) menyediakan:

- `useSite()` hook — akses ke site aktif dan daftar semua site
- Site switcher di sidebar untuk berpindah antar lokasi
- Persistensi ke `localStorage` agar pilihan site bertahan setelah refresh
- `apiFetch` secara otomatis menyertakan header `x-site-id` pada setiap API call

## Tabel Database dengan Kolom `site_id`

| Tabel | Kolom |
|-------|-------|
| `tenants` | `site_id` |
| `tenant_bookings` | `site_id` |
| `tenant_invoices` | `site_id` |
| `tenant_payments` | `site_id` |
| `mall_units` | `site_id` |
| `cashier_shifts` | `site_id` |
| `audit_logs` | `site_id` |

Tabel pendukung:

| Tabel | Fungsi |
|-------|--------|
| `mall_sites` | Daftar semua site/lokasi |
| `user_site_access` | Kontrol akses user ke site tertentu |

## Route yang Sudah Menerapkan Filter Site

### Data Filtering (GET)
- `GET /api/tenants` — filter berdasarkan `siteId`
- `GET /api/bookings` — filter berdasarkan `siteId`
- `GET /api/tenant-invoices` — filter berdasarkan `siteId`
- `GET /api/mall-units` — filter units, bookings, dan tenants berdasarkan `siteId`
- `GET /api/mall-units/floors` — filter lantai berdasarkan `siteId`
- `GET /api/tenant-pos/overview` — statistik per site
- `GET /api/tenant-pos/floor-plan` — denah per site
- `GET /api/tenant-pos/tenants/:id/invoices` — invoice per site
- `GET /api/tenant-pos/recent-payments` — pembayaran terbaru per site
- `GET /api/tenant-pos/daily-report` — laporan harian per site
- `GET /api/laporan/summary` — ringkasan bulanan per site
- `GET /api/laporan/kpi` — KPI per site
- `GET /api/laporan/piutang` — piutang per site
- `GET /api/laporan/aging` — aging per site
- `GET /api/laporan/payment-methods` — metode bayar per site
- `GET /api/laporan/rekap-payments` — rekap pembayaran per site
- `GET /api/laporan/tenants-list` — dropdown tenant per site
- `GET /api/laporan/floors-list` — dropdown lantai per site
- `GET /api/audit-logs` — audit log per site (owner melihat semua)

### Injeksi `siteId` saat Create (POST)
- `POST /api/tenants` — tenant dibuat dengan siteId aktif
- `POST /api/bookings` — booking dibuat dengan siteId aktif
- `POST /api/tenant-invoices` — invoice dibuat dengan siteId aktif
- `POST /api/tenant-invoices/generate-from-booking/:id` — invoice dari booking
- `POST /api/tenant-invoices/:id/payment` — pembayaran invoice
- `POST /api/mall-units` — unit dibuat dengan siteId aktif
- `POST /api/mall-units/seed` — seed unit dengan siteId aktif
- `POST /api/tenant-pos/payments` — pembayaran POS dengan siteId aktif
- `POST /api/tenant-pos/shifts/open` — buka shift kasir dengan siteId aktif

## Cara Menambah Site Baru

1. Insert ke tabel `mall_sites`:
   ```sql
   INSERT INTO mall_sites (code, name, type, status)
   VALUES ('KODE_SITE', 'Nama Lokasi', 'mall_tenant', 'active');
   ```

2. Berikan akses ke user yang perlu mengelola site tersebut di tabel `user_site_access`:
   ```sql
   INSERT INTO user_site_access (user_id, site_id)
   SELECT u.id, s.id
   FROM users u, mall_sites s
   WHERE u.email = 'user@example.com' AND s.code = 'KODE_SITE';
   ```

3. Frontend akan otomatis menampilkan site baru di site switcher sidebar.

## Testing

File test isolasi multi-site: `artifacts/api-server/src/__tests__/multi-site.test.ts`

Jalankan test:
```bash
pnpm --filter @workspace/api-server test multi-site
```

Test mencakup:
- Isolasi tenant: data site A tidak terlihat dari site B
- Inject siteId: data baru mendapat siteId yang benar dari header
- Isolasi booking dan invoice
- KPI dan laporan per site
- Daftar site tersedia
