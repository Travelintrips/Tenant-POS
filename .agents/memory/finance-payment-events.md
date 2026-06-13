---
name: Finance Payment Events
description: Implementasi tabel finance_payment_events sebagai event log pembayaran lintas modul; helper writePaymentEvent; fix bank reconciliation approve untuk invoice.
---

## Tabel finance_payment_events
- Migration: `0030_finance_payment_events` (lib/db/src/migrator.ts)
- Schema: `lib/db/src/schema/finance-payment-events.ts`
- Export: `lib/db/src/schema/index.ts`

## Kolom utama
- `source_app`: "tenant_management" | "tenant_pos"
- `source_module`: "tenant_invoice" | "pos_sale"
- `source_table`: "tenant_payments"
- `source_id`: ID record di source_table (idempotency key bersama amount+direction)
- `payment_status`: pending → waiting_confirmation → confirmed | rejected
- `is_reconciled`: false sampai bank recon approve dijalankan
- `bank_mutation_id`: diisi saat direkonsiliasi

## writePaymentEvent helper
- File: `artifacts/api-server/src/lib/payment-events.ts`
- Idempotent: cek existing via (source_app, source_table, source_id, amount, direction)
- Jika sudah ada → update status + bankMutationId + isReconciled
- Jika belum → insert baru
- Error ditangkap diam-diam (tidak boleh break payment flow)

## Di mana dipanggil
1. `pending-payments.ts` → setelah approve → paymentStatus: "confirmed"
2. `tenant-invoices.ts` → setelah direct payment → paymentStatus: "confirmed"
3. `tenant-pos.ts` → setelah POS payment → paymentStatus: "waiting_confirmation" (transfer) atau "confirmed" (tunai/qris/edc)
4. `bank-reconciliation.ts` → setelah approve candidateType=invoice → paymentStatus: "confirmed", isReconciled: true

## CRITICAL FIX — bank recon approve untuk invoice
**Sebelum**: approve hanya update mutation.status + match.status
**Sesudah**: saat candidateType="invoice", approve juga:
1. Buat tenant_payment baru (method: "transfer", receiptNumber: REKON-PAY-YYYYMMDD-XXXX)
2. Update invoice.paidAmount / outstandingAmount / status
3. Tulis finance_payment_event dengan isReconciled=true
4. Set mutation.matchedPaymentId = newPayment.id

**Why:** Tanpa ini, rekonsiliasi bank tidak pernah settle invoice.

## Bank Matcher (bank-matcher.ts)
- Kandidat 1 (prioritas): finance_payment_events (isReconciled=false, status IN pending/waiting_confirmation)
- Kandidat 2: tenant_payments
- Kandidat 3: tenant_invoices
- Score threshold untuk auto-match: ≥ 95

## KPI Endpoint
- GET /api/bank-reconciliation/kpi
- Return: mutations stats, paymentEvents stats (+ totalConfirmedAmount), invoices stats (paid/partial/unpaid/overdue)
- UI: bank-rekonsiliasi.tsx KPI panel 3 card (Mutasi Bank, Event Pembayaran, Status Invoice)
