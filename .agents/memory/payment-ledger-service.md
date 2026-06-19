---
name: Payment Ledger Service
description: Desain PaymentLedgerService — recordPayment (central orchestration), approveExistingPayment (OCR flip), overpayment guard, idempotency
---

# Payment Ledger Service

## Rule
Semua update `paid_amount` invoice HARUS melalui:
- `recordPayment(tx, params)` — untuk insert payment baru (POS+invoice, bank recon, unified endpoint)
- `approveExistingPayment(tx, paymentId, invoiceId, approvedBy, now)` — untuk flip OCR pending_review → approved

Jangan gunakan `+= amount` manual atau panggil `syncInvoiceFromPayments` langsung kecuali di dalam dua fungsi di atas.

**Why:** `recordPayment` menjamin idempotency (cek duplicate referenceId), anti-overpayment (validateNoOverpayment), insert, dan sync invoice dalam satu alur terpadu. `approveExistingPayment` menjamin overpayment dicek sebelum flip status OCR.

## source_type enum (canonical)
`"pos" | "ocr" | "bank" | "manual"` — BUKAN "bank_recon" atau "upload".

## LedgerError handling
Semua route yang memanggil recordPayment/approveExistingPayment harus catch `LedgerError`:
- `OVERPAYMENT` → HTTP 400
- `DUPLICATE` → HTTP 409

## POST /api/payments response format
`{ ledgerId, invoiceStatus, paidAmount, remaining, receiptId }` — bukan `{ success, payment, invoice }`.

## POS kembalian (change) handling
POS menyimpan `appliedAmount = Math.min(amountPaid, Math.max(effectiveBill, 0))` ke invoice via recordPayment.
`change = amountPaid - appliedAmount` dikembalikan ke frontend. Booking tetap diupdate dengan `amountPaid` penuh.

## Schema columns
- `tenant_payments.reference_id` — partial unique index WHERE NOT NULL (migration 0046)
- `tenant_payments.source_type` — enum text (migration 0046)
- `tenant_invoices.ppn_amount` — numeric DEFAULT 0 (migration 0047)
