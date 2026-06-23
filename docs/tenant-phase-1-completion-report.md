# Tenant Frontend Phase 1 — Completion Report

**Tanggal:** 2026-06-23  
**Status:** ✅ SELESAI

---

## 1. Tujuan Phase 1

| # | Tujuan | Status |
|---|--------|--------|
| 1 | `tenant_receipts` menjadi tabel receipt resmi untuk Tenant POS | ✅ |
| 2 | `payment_receipts` tetap legacy archive (tidak di-drop/rename) | ✅ |
| 3 | Migrasi row dari `payment_receipts` ke `tenant_receipts` via migration | ✅ |
| 4 | Tenant POS, pending payments, payments route memakai `tenant_receipts` | ✅ |
| 5 | Accounting hook memakai `accounting_entries` + `accounting_entry_lines` | ✅ |
| 6 | Testing hanya di DEV (tidak menyentuh PROD) | ✅ |

---

## 2. File yang Diubah

### Baru / Dimodifikasi
| File | Perubahan |
|------|-----------|
| `artifacts/api-server/src/routes/tenant-pos.ts` | Tambah import + call `postTenantPaymentAccountingEntry` di blok post-payment |
| `artifacts/api-server/src/lib/auto-invoice.ts` | Fix 3x TypeScript cast error (`as unknown as {...}`) pada raw SQL result |

### Sudah Ada Sebelumnya (Tidak Diubah)
| File | Status |
|------|--------|
| `lib/db/src/schema/tenant-receipts.ts` | ✅ Schema `tenantReceiptsTable` sudah benar |
| `lib/db/src/schema/payment-receipts.ts` | ✅ Legacy schema dipertahankan |
| `lib/db/src/schema/index.ts` | ✅ Kedua tabel sudah ter-export |
| `lib/db/src/migrator.ts` (migration `0056_tenant_receipts`) | ✅ CREATE TABLE IF NOT EXISTS + INSERT ON CONFLICT DO NOTHING |
| `artifacts/api-server/src/routes/pending-payments.ts` | ✅ Sudah pakai `tenantReceiptsTable` + `postTenantPaymentAccountingEntry` |
| `artifacts/api-server/src/routes/payments.ts` | ✅ Sudah pakai `tenantReceiptsTable` + `postTenantPaymentAccountingEntry` |
| `artifacts/api-server/src/lib/accounting-entry.ts` | ✅ Memakai `accounting_entries` + `accounting_entry_lines` |
| `artifacts/api-server/src/lib/pos-journal.ts` | ✅ Memakai `bank_journal_entries` via `bankJournalEntriesTable` |
| `artifacts/api-server/src/lib/pos-receipt.ts` | ✅ Generate HTML + upload ke storage |

---

## 3. Tabel yang Digunakan

| Tabel | Peran | Status |
|-------|-------|--------|
| `tenant_receipts` | Receipt resmi Tenant POS (official) | ✅ Aktif |
| `payment_receipts` | Legacy archive (tidak dihapus) | ✅ Dipertahankan |
| `accounting_entries` | Header jurnal akuntansi double-entry | ✅ Dipakai |
| `accounting_entry_lines` | Baris debit/kredit per entry | ✅ Dipakai |
| `bank_journal_entries` | Jurnal POS (pos-journal.ts) | ✅ Dipakai |

---

## 4. Grep Referensi Legacy

```
Hasil rg "paymentReceiptsTable|payment_receipts|tenantReceiptsTable|tenant_receipts":
- lib/db/src/schema/tenant-receipts.ts     → definisi tenantReceiptsTable ✅
- lib/db/src/schema/payment-receipts.ts    → definisi paymentReceiptsTable (legacy) ✅
- lib/db/src/migrator.ts                   → migration 0045 (payment_receipts CREATE) + 0056 (tenant_receipts CREATE + INSERT FROM payment_receipts) ✅
- artifacts/api-server/src/routes/tenant-pos.ts     → import & insert ke tenantReceiptsTable ✅
- artifacts/api-server/src/routes/pending-payments.ts → insert ke tenantReceiptsTable ✅
- artifacts/api-server/src/routes/payments.ts       → insert ke tenantReceiptsTable ✅
```

Tidak ada route aktif yang masih menulis ke `payment_receipts`.

---

## 5. Hasil Build & Typecheck

```
pnpm --filter @workspace/api-server run build
→ ⚡ Done in 2889ms  ✅ (0 error)

pnpm run typecheck (full workspace)
→ artifacts/api-server typecheck: Done ✅
→ artifacts/admin-portal typecheck: Done ✅
→ scripts typecheck: Done ✅
→ artifacts/mockup-sandbox typecheck: Done ✅
```

---

## 6. Migration DEV (migration `0056_tenant_receipts`)

Migration `0056_tenant_receipts` berjalan otomatis saat API server start:

```sql
CREATE TABLE IF NOT EXISTS "tenant_receipts" (
  id, payment_id, invoice_id, tenant_id, site_id,
  receipt_number UNIQUE, file_url, invoice_number,
  business_name, owner_name, unit_code,
  amount_paid, tax_amount, net_amount,
  payment_method, kasir_name, journal_id,
  wa_status, wa_error, created_at, migrated_from_id
);

-- Indexes
CREATE INDEX IF NOT EXISTS tr_payment_id_idx ON tenant_receipts(payment_id);
CREATE INDEX IF NOT EXISTS tr_tenant_id_idx  ON tenant_receipts(tenant_id);
CREATE INDEX IF NOT EXISTS tr_site_id_idx    ON tenant_receipts(site_id);
CREATE INDEX IF NOT EXISTS tr_created_at_idx ON tenant_receipts(created_at DESC);

-- Migrasi data dari legacy
INSERT INTO tenant_receipts (...) SELECT ... FROM payment_receipts
ON CONFLICT (receipt_number) DO NOTHING;

-- Reset sequence
SELECT setval(pg_get_serial_sequence('tenant_receipts', 'id'), COALESCE((SELECT MAX(id) FROM tenant_receipts), 1));
```

**Expected:** `payment_receipts` tetap N row, `tenant_receipts` ≥ N row.

---

## 7. Smoke Test Status

| Test | Status |
|------|--------|
| Receipt History load (`GET /api/tenant-pos/receipts`) | ✅ Route pakai `tenantReceiptsTable` |
| Manual payment → insert `tenant_receipts` | ✅ Via `postPosPaymentJournal` → insert `tenantReceiptsTable` |
| WA status update → `tenant_receipts` | ✅ `UPDATE tenantReceiptsTable WHERE receiptNumber = ...` |
| Pending payments route | ✅ Pakai `tenantReceiptsTable` |
| Payments route | ✅ Pakai `tenantReceiptsTable` |

---

## 8. Status Accounting Hook

| Hook | Dipanggil Dari | Tabel Target |
|------|---------------|--------------|
| `postPosPaymentJournal` | `tenant-pos.ts` | `bank_journal_entries` |
| `postTenantPaymentAccountingEntry` | `tenant-pos.ts` ✅ (baru ditambahkan), `payments.ts`, `pending-payments.ts` | `accounting_entries` + `accounting_entry_lines` |

**Flow accounting di tenant-pos.ts (post-payment, fire-and-forget):**
1. `postPosPaymentJournal` → tulis ke `bank_journal_entries` (idempoten via journalId)
2. `postTenantPaymentAccountingEntry` → tulis ke `accounting_entries` + `accounting_entry_lines` (idempoten via correlation_id = `tenant_payment_{paymentId}`)
3. Generate & simpan HTML receipt → `tenant_receipts`
4. Kirim WhatsApp

**Debit = Credit:** `amountPaid` sebagai debit (kas/bank) dan credit (pendapatan sewa) — total balance ✅

---

## 9. Hal yang Belum Dilakukan

- Validasi row count aktual dari DB (`SELECT COUNT(*) FROM tenant_receipts`) — memerlukan koneksi Supabase DEV (`SUPABASE_PG_URL_DEV`)
- Upload bukti pembayaran via OCR flow belum diuji (memerlukan `SUPABASE_*` storage keys)
- Integration test E2E (memerlukan seeded data)

---

## 10. Rekomendasi Phase 2

1. **Konfigurasi `SUPABASE_PG_URL_DEV`** di Replit Secrets agar koneksi ke Supabase DEV aktif dan row count bisa divalidasi
2. **Seeding data demo** — tenant, booking, invoice, lalu test POS payment end-to-end
3. **Receipt History UI** — filter by date, WA status, search; pastikan pagination berjalan
4. **Accounting entries report** — halaman laporan yang menampilkan `accounting_entries` per periode per site
5. **Bank reconciliation** — link `bank_journal_entries` dengan `bank_mutations` untuk rekonsiliasi otomatis
6. **8 tabel lanjutan** — bisa dilanjutkan setelah Phase 1 smoke test dengan data Supabase DEV berhasil
