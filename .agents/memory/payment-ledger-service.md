---
name: Payment Ledger Service
description: PaymentLedgerService design — syncInvoiceFromPayments, idempotency, overpayment guard, source_type tagging
---

# Payment Ledger Service

## Rule
Always use `syncInvoiceFromPayments(tx, invoiceId)` from `artifacts/api-server/src/lib/payment-ledger.ts` to update invoice paid_amount — never do `+= amount` manually.

**Why:** The aggregate approach is idempotent and always converges to the correct state regardless of call order or retries. The old `+= amount` pattern is fragile — concurrent requests, retries, or out-of-order approval can leave paid_amount out of sync.

## How to apply
- Import: `import { syncInvoiceFromPayments, findDuplicatePayment, validateNoOverpayment, LedgerError } from "../lib/payment-ledger";`
- Call AFTER inserting the payment record (within same tx), so the aggregate includes the new payment
- `findDuplicatePayment(referenceId)` returns existing paymentId or null — call BEFORE opening tx to avoid holding lock during network check
- `validateNoOverpayment(tx, invoiceId, amount)` throws `LedgerError("OVERPAYMENT", msg)` — call inside tx, before insert
- Catch `LedgerError`: code "OVERPAYMENT" → 400, code "DUPLICATE" → 409

## Column conventions
- `reference_id TEXT` — system-generated idempotency key, partial unique index (WHERE reference_id IS NOT NULL)
  - POS: `POS-{shiftId ?? "ns"}-{receiptNumber}`
  - Bank recon: `RECON-{mutationId}`
  - Manual/unified: caller-supplied or null
- `source_type TEXT` — which flow created the payment: "pos" | "bank_recon" | "manual" | "upload"

## syncInvoiceFromPayments filter
Aggregates: `approvalStatus = 'approved' AND is_voided = false`
- POS payments: approvalStatus defaults to "approved" (set explicitly in insert)
- OCR payments: approvalStatus starts as "pending_review", flipped to "approved" at approval → sync called after flip
- Bank recon: approvalStatus set to "approved" in insert → sync called after insert

## Unified endpoint
`POST /api/payments` at `artifacts/api-server/src/routes/payments.ts` — mounted after requireAuth+requireNonTenantUser in routes/index.ts. Accepts invoiceId, amount, paymentMethod, referenceId (optional), sourceType.
