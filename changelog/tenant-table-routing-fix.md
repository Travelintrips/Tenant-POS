# Changelog: Tenant Table Routing Fix
> Status: AUDIT SELESAI — Implementasi menunggu persetujuan scope

---

## 2026-06-22 — Audit Awal

### Temuan

**Sistem berjalan dengan baik untuk operasional harian:**
- Semua halaman utama (Data Tenant, Booking, Invoice, POS, Laporan) sudah menggunakan tabel `tenant_*` resmi
- Tidak ada query Supabase langsung dari frontend
- `sc_payments` tidak dipakai (0 baris) — aman diabaikan

**Satu masalah nyata:**
- `payment_receipts` (18 baris) digunakan aktif oleh POS Tenant sebagai tabel receipt
- Masuk daftar "forbidden" tapi tidak bisa dihapus tanpa migrasi data + kode

**8 tabel "required" belum ada di DB:**
- `tenant_invoice_items`, `tenant_receipts`, `tenant_pos_sales`, `tenant_pos_sale_items`, `tenant_expenses`
- `accounting_journal_lines`, `accounting_invoices`, `accounting_expenses`

**Accounting journals:**
- `bank_journal_entries` berfungsi sebagai jurnal POS saat ini
- Tabel `accounting_journals` ada (28 baris) tapi dipakai modul berbeda
- Tidak ada `accounting_journal_lines` — sistem pakai `accounting_entry_lines`

### Perubahan yang sudah dilakukan sebelum task ini
- `computeUnitStatus`: unit dengan tenant aktif (via booth_number) kini tampil "Terisi"
- `GET /api/mall-units`: lookup tenant langsung via `booth_number`, tanpa wajib booking
- Data Tenant: cache invalidasi diperluas ke `mall-units` juga

### Yang BELUM dilakukan (menunggu konfirmasi scope)
- Pembuatan 8 tabel baru
- Migrasi `payment_receipts` → `tenant_receipts`
- Accounting journal integration untuk setiap pembayaran
- Test suite (create invoice, partial payment, receipt history, journal created, report)
- DEV smoke test via `SUPABASE_PG_URL` (project lama xssrfshdrtdfupgqwfdw)

---

## Keputusan yang dibutuhkan sebelum lanjut

1. **`payment_receipts`**: Rename/alias ke `tenant_receipts`, atau buat tabel baru dan migrasi 18 baris?
2. **`accounting_journal_lines`**: Tabel baru, atau aliaskan `accounting_entry_lines` yang sudah ada?
3. **DEV testing**: Pakai `DATABASE_URL` (local heliumdb) atau `SUPABASE_PG_URL` (project lama Supabase)?
4. **`tenant_units` vs `mall_units`**: Task menyebut `tenant_units` tapi sistem pakai `mall_units`. Tetap pakai `mall_units`?
5. **Scope Fase 1**: Apakah cukup fix `payment_receipts` + accounting hook dulu, atau harus semua 8 tabel sekaligus?
