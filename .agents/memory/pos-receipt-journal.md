---
name: POS Receipt & Journal Flow
description: Architecture for post-payment receipt generation, accounting journal, and WA notification in tenant-pos route
---

# POS Receipt + Accounting Journal + WA Flow

## Design

After `POST /api/tenant-pos/payments` transaction commits, a **fire-and-forget** `void (async () => { ... })()` block runs without blocking the HTTP response.

Order of operations (all non-blocking after response is sent):
1. `postPosPaymentJournal` — writes to `bank_journal_entries` with `journalId = POS-YYYYMMDD-{paymentId}`; idempotent (checks existing before insert); `mutationId = null` (nullable FK)
2. `generateReceiptHtml` + `saveReceiptFile` — generates HTML receipt to `uploads/receipts/{receiptNumber}.html`; served as static via `/uploads/receipts/`
3. `db.insert(paymentReceiptsTable)` — records receipt metadata including `waStatus: "pending"`
4. `sendPosPaymentSuccess` — Fonnte WA with receipt link; skipped if no FONNTE_TOKEN; phone from tenant row
5. `db.update(paymentReceiptsTable)` — sets final `waStatus` (sent/skipped/failed)

## Rules
- Journal is CRITICAL: errors inside postPosPaymentJournal are caught by outer try/catch and logged
- Receipt failure is non-critical: caught in inner try/catch, payment stays valid
- WA failure is non-critical: payment stays valid, waStatus = "failed" recorded
- Payment response does NOT include receiptUrl — frontend polls `GET /api/tenant-pos/receipts/:paymentId`

## Frontend polling
- `useQuery` with `enabled: !!result?.payment?.id`; retries 5 times with 1.5s delay
- `refetchInterval` continues if `waStatus === "pending"`, stops otherwise

## Key files
- `artifacts/api-server/src/lib/pos-journal.ts` — postPosPaymentJournal
- `artifacts/api-server/src/lib/pos-receipt.ts` — generateReceiptHtml + saveReceiptFile
- `lib/db/src/schema/payment-receipts.ts` — paymentReceiptsTable schema
- Migration `0045_payment_receipts` in migrator.ts

**Why:** Existing `postAccountingJournal` requires `mutationId` (bank_mutations FK) — POS payments have no bank mutation, so a separate `postPosPaymentJournal` was needed with `mutationId = null`.
