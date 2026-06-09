# Panduan Testing — Mall Admin Portal

## Ringkasan

Suite test untuk Mall Admin Portal menggunakan **Vitest** sebagai test runner utama, **Supertest** untuk backend API integration test, dan **React Testing Library** untuk frontend component test.

---

## Cara Menjalankan Test

### Semua test (backend + frontend)
```bash
pnpm run test
```

### Hanya backend (API integration test)
```bash
pnpm run test:backend
# atau langsung:
pnpm --filter @workspace/api-server run test
```

### Hanya frontend (component test)
```bash
pnpm run test:frontend
# atau langsung:
pnpm --filter @workspace/admin-portal run test
```

### Mode watch (auto re-run saat file berubah)
```bash
pnpm --filter @workspace/api-server run test:watch
pnpm --filter @workspace/admin-portal run test:watch
```

### Coverage report
```bash
pnpm run test:coverage
# Output: artifacts/api-server/coverage/ dan artifacts/admin-portal/coverage/
```

---

## Environment Variable untuk Test

Backend test membutuhkan variable berikut (sudah otomatis di-set via `vitest.config.ts`):

| Variable | Nilai di Test | Keterangan |
|---|---|---|
| `NODE_ENV` | `test` | Mengaktifkan dev-login, menonaktifkan pino-pretty |
| `PORT` | `8080` | Diperlukan config.ts (supertest buat port sendiri) |
| `LOG_LEVEL` | `silent` | Supresses semua log saat test berjalan |
| `DATABASE_URL` | (dari Replit secrets) | Menggunakan dev DB Replit — **bukan production** |

> **Penting:** Backend test berjalan di **database development Replit**. Test membuat data dengan prefix unik dan membersihkannya setelah selesai (`afterAll`). Jangan jalankan test di environment production.

---

## Struktur File Test

```
artifacts/api-server/src/__tests__/
├── helpers/
│   ├── agent.ts          ← Supertest agent + dev-login helper
│   └── factory.ts        ← Factory functions + cleanup untuk test data
├── auth.test.ts          ← Fase 1: Login, role, permission
├── tenants.test.ts       ← Fase 1+8: Tenant CRUD + validasi + upload
├── bookings.test.ts      ← Fase 2: Kontrak tenant
├── invoices.test.ts      ← Fase 3: Invoice/tagihan
├── tenant-pos.test.ts    ← Fase 4: POS pembayaran
├── mall-units.test.ts    ← Fase 5: Denah dan unit
├── laporan.test.ts       ← Fase 6: Laporan piutang
├── audit-logs.test.ts    ← Fase 7: Audit log
└── sse.test.ts           ← Fase 10: Realtime/SSE

artifacts/admin-portal/src/
├── test/
│   ├── setup.ts          ← jest-dom, fetch mock, window mocks
│   └── render-utils.tsx  ← renderWithProviders, withUser helper
└── __tests__/
    ├── auth-guard.test.tsx            ← Fase 1: AuthGuard logic
    └── pages/
        ├── data-tenant.test.tsx       ← Fase 1: Halaman tenant
        ├── booking-tenant.test.tsx    ← Fase 2: Halaman booking
        ├── tenant-invoices.test.tsx   ← Fase 3: Halaman invoice
        ├── laporan.test.tsx           ← Fase 6: Halaman laporan
        └── audit-logs.test.tsx        ← Fase 7: Halaman audit log
```

---

## Backend Test — Detail

Setiap test file backend:
1. Membuat supertest agent via `makeAuthAgent(role)` → dev-login otomatis
2. Membuat test data via factory (`createTestTenant`, `createTestBooking`, dll.)
3. Melakukan HTTP request ke Express app (tidak perlu server running)
4. Membersihkan semua data test di `afterAll` via `cleanupAll()`

### Cakupan per file

| File | Jumlah Test | Yang Diuji |
|---|---|---|
| `auth.test.ts` | ~14 | Dev-login, 401/403, role restriction, logout |
| `tenants.test.ts` | ~12 | CRUD tenant, validasi wajib, upload file |
| `bookings.test.ts` | ~9 | CRUD booking, validasi tanggal/amount, terminasi |
| `invoices.test.ts` | ~8 | CRUD invoice, format nomor, transisi status |
| `tenant-pos.test.ts` | ~9 | Payment CRUD, void payment, role cashier |
| `mall-units.test.ts` | ~7 | CRUD unit, status update, floor-plan |
| `laporan.test.ts` | ~8 | KPI, summary, aging, CSV export |
| `audit-logs.test.ts` | ~6 | Log creation, data sensitif, filter |
| `sse.test.ts` | ~3 | SSE connection, auth check, latency |

---

## Frontend Test — Detail

Frontend test menggunakan:
- **jsdom** sebagai browser environment
- **fetch mock** global di `src/test/setup.ts`
- **QueryClient** fresh per test (tidak ada cache crosstalk)
- **Wouter Router** untuk routing context

Setiap halaman ditest untuk:
1. Render tanpa crash
2. Menampilkan data dari API (via mocked fetch)
3. Element UI kritis tersedia

---

## E2E Test — Manual Checklist

Playwright belum diimplementasikan (environment Replit membutuhkan setup tambahan). Gunakan checklist berikut untuk pengujian manual end-to-end:

### Skenario 1 — Alur Lengkap Owner
- [ ] Login dev sebagai **owner**
- [ ] Buat tenant baru di halaman Data Tenant
- [ ] Buat booking/kontrak untuk tenant tersebut
- [ ] Generate invoice dari halaman Invoice
- [ ] Bayar invoice full dari halaman POS
- [ ] Cek status invoice berubah menjadi **paid**
- [ ] Cek laporan KPI revenue naik sesuai pembayaran

### Skenario 2 — Kasir Bayar Tagihan
- [ ] Login dev sebagai **cashier**
- [ ] Buka halaman POS
- [ ] Pilih unit/tenant dari floor plan
- [ ] Lihat invoice yang belum dibayar
- [ ] Input pembayaran dengan metode yang dipilih
- [ ] Cetak struk/receipt
- [ ] Cek history pembayaran shift

### Skenario 3 — Finance Lihat Laporan
- [ ] Login dev sebagai **finance**
- [ ] Buka halaman Laporan
- [ ] Verifikasi KPI card menampilkan data benar
- [ ] Lihat aging receivable
- [ ] Export CSV piutang
- [ ] Pastikan finance tidak bisa akses Data Tenant (403)

### Skenario 4 — Void Payment
- [ ] Login sebagai **owner**
- [ ] Buat payment
- [ ] Void payment dengan alasan
- [ ] Verifikasi payment terVoid tidak masuk laporan revenue

---

## Quality Gate

Pastikan semua perintah berikut berhasil sebelum deploy:

```bash
pnpm run typecheck    # TypeScript check seluruh workspace
pnpm run test         # Semua test pass
pnpm run build        # Build production berhasil
```

---

## Batasan Test yang Belum Diimplementasikan

| Fitur | Alasan Belum Ada |
|---|---|
| E2E test Playwright | Membutuhkan browser binary + setup Playwright di Replit |
| Test double booking overlap | Perlu skenario timing yang kompleks antar test |
| Performance / load test | Di luar scope fase 11 |
| Frontend form submission test | Form pages membutuhkan mock yang sangat spesifik per field |
| POS shift open/close test (frontend) | Komponen POS sangat complex dengan banyak state |
| Snapshot test | Tidak diprioritaskan; behavior test lebih bernilai |

---

## Tips Debugging Test

```bash
# Jalankan satu file test saja
pnpm --filter @workspace/api-server exec vitest run src/__tests__/auth.test.ts

# Jalankan dengan output verbose
pnpm --filter @workspace/api-server exec vitest run --reporter=verbose

# Lihat coverage HTML
pnpm --filter @workspace/api-server run test:coverage
# Buka artifacts/api-server/coverage/index.html di browser
```
