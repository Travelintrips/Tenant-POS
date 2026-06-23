# Tenant Frontend — Table Routing (Current State)
> Tanggal: 2026-06-22 | Status: Audit awal sebelum migrasi

---

## Halaman → API Route → Tabel DB

### Data Tenant (`/data-tenant`)
| Operasi | API Route | Tabel |
|---------|-----------|-------|
| List tenant | `GET /api/tenants` | `tenants` |
| Create | `POST /api/tenants` | `tenants` |
| Update | `PUT /api/tenants/:id` | `tenants` |
| Delete | `DELETE /api/tenants/:id` | `tenants` |
| Bulk delete | `DELETE /api/tenants/bulk` | `tenants`, `tenant_payments`, `tenant_invoices`, `tenant_bookings` |
| Unit list (dropdown) | `GET /api/mall-units` | `mall_units` |

**Status:** ✅ Sudah menggunakan tabel resmi. Tidak ada legacy.

---

### Booking Tenant (`/booking-tenant`)
| Operasi | API Route | Tabel |
|---------|-----------|-------|
| List booking | `GET /api/bookings` | `tenant_bookings`, `tenants` |
| Create | `POST /api/bookings` | `tenant_bookings` |
| Update | `PUT /api/bookings/:id` | `tenant_bookings` |
| Delete | `DELETE /api/bookings/:id` | `tenant_bookings` |

**Status:** ✅ Sudah menggunakan tabel resmi.

---

### Invoice Tenant (`/invoice-tenant`)
| Operasi | API Route | Tabel |
|---------|-----------|-------|
| List invoice | `GET /api/tenant-invoices` | `tenant_invoices`, `tenants` |
| Create | `POST /api/tenant-invoices` | `tenant_invoices` |
| Update | `PATCH /api/tenant-invoices/:id` | `tenant_invoices` |
| Payment | `POST /api/tenant-invoices/:id/payment` | `tenant_invoices`, `tenant_payments` |
| Export CSV | Client-side | — |

**Status:** ✅ Sudah menggunakan tabel resmi. Tidak ada `tenant_invoice_items` (semua disimpan di satu row).

---

### POS Tenant (`/tenant-pos`)
| Operasi | API Route | Tabel |
|---------|-----------|-------|
| List tenant | `GET /api/tenant-pos/tenants` | `tenants`, `mall_units` |
| Payment | `POST /api/tenant-pos/payments` | `tenant_payments`, `payment_receipts`, `bank_journal_entries` |
| Manual payment | `POST /api/tenant-pos/manual-payment` | `tenant_payments`, `payment_receipts`, `bank_journal_entries` |
| History | `GET /api/tenant-pos/history` | `tenant_payments`, `tenants` |
| Void | `POST /api/tenant-pos/payments/:id/void` | `tenant_payments` |
| Shift open/close | `POST /api/tenant-pos/shifts/*` | `cashier_shifts` |

**Status:** ⚠️ Menggunakan `payment_receipts` (tabel "forbidden"). Perlu migrasi ke `tenant_receipts`.

---

### Laporan Tenant (`/laporan`)
| Operasi | API Route | Tabel |
|---------|-----------|-------|
| Revenue report | `GET /api/laporan/tenant-revenue` | `tenant_payments`, `tenants`, `tenant_bookings` |
| Export CSV | Client-side | — |

**Status:** ✅ Sudah menggunakan tabel resmi.

---

### Receipt / Payment History
| Operasi | API Route | Tabel |
|---------|-----------|-------|
| Receipt HTML | `GET /api/tenant-pos/receipts/:id` | `payment_receipts` |
| Payment history | `GET /api/tenant-pos/history` | `tenant_payments` |

**Status:** ⚠️ Receipt disimpan di `payment_receipts`. Perlu migrasi.

---

## Alur Accounting Saat Ini (POS)

```
POS Payment Request
       ↓
POST /api/tenant-pos/payments
       ↓
1. INSERT tenant_payments (amount, method, shift_id, ...)
2. INSERT payment_receipts (receipt_number, file_url, journal_id)
3. Upload HTML ke Supabase Storage
4. INSERT bank_journal_entries (journalId=POS-YYYYMMDD-paymentId)
5. UPDATE cashier_shifts (actual_cash)
```

**Gap:** Tidak ada insert ke `accounting_journals` / `accounting_journal_lines` secara langsung.
`bank_journal_entries` berfungsi sebagai jurnal, tapi skemanya berbeda.

---

## Rekomendasi Prioritas

### Fase 1 — Perbaikan minimal, tanpa breaking change (1-2 hari)
- [x] Tidak ada — sistem sudah cukup stabil untuk operasional harian

### Fase 2 — Migrasi receipt (2-3 hari)
- [ ] Buat tabel `tenant_receipts` dengan skema kompatibel `payment_receipts`
- [ ] Tambahkan migration SQL di `lib/db/src/migrator.ts`
- [ ] Update `tenant-pos.ts` routes untuk INSERT ke `tenant_receipts`
- [ ] Buat endpoint GET untuk receipt history menggunakan `tenant_receipts`
- [ ] Migrasi 18 baris data existing dari `payment_receipts` → `tenant_receipts`

### Fase 3 — Accounting integration (3-5 hari)
- [ ] Tentukan apakah pakai tabel baru (`accounting_journal_lines`) atau rename `accounting_entry_lines`
- [ ] Buat wrapper `createTenantJournal()` yang menulis ke tabel yang disepakati
- [ ] Hook ke setiap `tenant_payments` INSERT

### Fase 4 — POS sales detail & expenses (5+ hari)
- [ ] Buat `tenant_pos_sales` + `tenant_pos_sale_items`
- [ ] Buat `tenant_expenses`
- [ ] Refactor POS routes
