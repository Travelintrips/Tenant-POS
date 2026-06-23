# Tenant Legacy Reference Report
> Tanggal audit: 2026-06-22 | DB: SUPABASE_PG_URL_PROD (nzdweipzckfszczzqtuw)

---

## 1. Status Tabel "Required" vs Aktual

| Tabel | Status di DB | Dipakai kode? | Catatan |
|-------|-------------|---------------|---------|
| `tenants` | ✅ ADA | ✅ Ya | Tabel utama tenant |
| `tenant_units` | ✅ ADA | ⚠️ Tidak | 2 baris, bukan `mall_units`. Skema berbeda. |
| `tenant_bookings` | ✅ ADA | ✅ Ya | Tabel booking/kontrak aktif |
| `tenant_invoices` | ✅ ADA | ✅ Ya | Tabel invoice aktif |
| `tenant_invoice_items` | ❌ TIDAK ADA | — | Belum dibuat |
| `tenant_payments` | ✅ ADA | ✅ Ya | 12 baris, tabel pembayaran utama |
| `tenant_receipts` | ❌ TIDAK ADA | — | Belum dibuat |
| `tenant_pos_sales` | ❌ TIDAK ADA | — | Belum dibuat |
| `tenant_pos_sale_items` | ❌ TIDAK ADA | — | Belum dibuat |
| `tenant_expenses` | ❌ TIDAK ADA | — | Belum dibuat |
| `accounting_journals` | ✅ ADA | ⚠️ Partial | 28 baris. Skema berbeda dari ekspektasi. |
| `accounting_journal_lines` | ❌ TIDAK ADA | — | Sistem pakai `accounting_entry_lines` |
| `accounting_payments` | ✅ ADA | ⚠️ Partial | Skema berbeda |
| `accounting_invoices` | ❌ TIDAK ADA | — | Belum dibuat |
| `accounting_expenses` | ❌ TIDAK ADA | — | Belum dibuat |

**Ringkasan:** 6 dari 15 tabel required sudah ada dan aktif. 8 tabel belum ada. 1 tabel ada tapi tidak dipakai (`tenant_units`).

---

## 2. Status Tabel "Forbidden"

| Tabel | Baris | Dipakai kode? | Kesimpulan |
|-------|-------|---------------|-----------|
| `sc_payments` | 0 | ❌ Tidak | Aman — tidak dipakai, bisa diabaikan |
| `payment_receipts` | 18 | ✅ **Ya, aktif** | ⚠️ **TIDAK BISA diabaikan** |

### Detail `payment_receipts`:
Tabel ini **aktif digunakan** oleh sistem POS Tenant sebagai penyimpanan receipt:
- Diisi otomatis setiap transaksi POS via `artifacts/api-server/src/routes/tenant-pos.ts`
- Berisi: receipt_number, file_url (Supabase Storage), business_name, unit_code, amount_paid, journal_id
- 18 baris berisi receipt transaksi nyata dari Sport Center (SC-KTN-01, SC-KTN-03, SC-KTN-04)

**Implikasi:** Jika `payment_receipts` dilarang, maka seluruh sistem receipt POS harus dimigrasi ke tabel baru (`tenant_receipts`). Ini bukan sekedar rename — butuh migrasi data + update kode API + Supabase Storage.

---

## 3. Sistem Accounting yang Ada Sekarang

Sistem accounting saat ini menggunakan tabel **berbeda** dari yang tercantum di task:

| Task bilang "pakai" | Sistem aktual pakai | Status |
|---------------------|---------------------|--------|
| `accounting_journals` | `accounting_journals` + `bank_journal_entries` | ⚠️ Dua sistem paralel |
| `accounting_journal_lines` | `accounting_entry_lines` | Nama berbeda |
| `accounting_invoices` | `tenant_invoices` | Konsep sama, nama berbeda |
| `accounting_expenses` | `operational_expenses` | Konsep sama, nama berbeda |

Alur accounting aktual:
1. POS Payment → `tenant_payments` + `payment_receipts`
2. POS Payment → `bank_journal_entries` (via `postPosPaymentJournal`)
3. Bank recon approve → `bank_journal_entries` + `finance_payment_events`
4. `accounting_entries` + `accounting_entry_lines` dipakai oleh modul accounting terpisah

---

## 4. Frontend — Query Database

✅ **Tidak ada query Supabase langsung dari frontend untuk data.**

Frontend hanya menggunakan:
- API client (`/api/*` routes) untuk semua data operasional
- Supabase client hanya untuk: Authentication (OTP) + Storage (upload bukti pembayaran)

---

## 5. DEV Environment

| Variabel | Nilai | Keterangan |
|----------|-------|-----------|
| `SUPABASE_DATABASE_URL_DEV` | ❌ Tidak ada | Secret ini tidak dikonfigurasi |
| `SUPABASE_PG_URL` | ✅ Ada | → Project lama `xssrfshdrtdfupgqwfdw` (deprecated) |
| `SUPABASE_PG_URL_PROD` | ✅ Ada | → Project aktif `nzdweipzckfszczzqtuw` |
| `DATABASE_URL` | ✅ Ada | → Local heliumdb (Replit) |

DEV environment yang tersedia: `DATABASE_URL` (local heliumdb) atau `SUPABASE_PG_URL` (project lama Supabase).

---

## 6. Gap Summary

Untuk memenuhi task sepenuhnya, dibutuhkan:

### Tabel baru yang harus dibuat (8 tabel):
1. `tenant_invoice_items` — line items per invoice
2. `tenant_receipts` — migrasi dari `payment_receipts`
3. `tenant_pos_sales` — header transaksi POS
4. `tenant_pos_sale_items` — line items POS
5. `tenant_expenses` — pengeluaran operasional per tenant
6. `accounting_journal_lines` — atau aliaskan ke `accounting_entry_lines`
7. `accounting_invoices` — atau aliaskan ke `tenant_invoices`
8. `accounting_expenses` — atau aliaskan ke `operational_expenses`

### Migrasi data yang dibutuhkan:
- 18 baris `payment_receipts` → `tenant_receipts`
- Semua transaksi POS dari `tenant_payments` → `tenant_pos_sales` (jika dipisah)

### Estimasi effort:
- **Skema + migrasi:** ~3 hari (8 tabel baru + integritas referensial)
- **API routes:** ~5 hari (update semua routes tenant-pos, tenant-invoices, laporan)
- **Frontend:** ~3 hari (update queries, tipe data)
- **Testing:** ~2 hari
- **Total:** ~13 hari kerja
