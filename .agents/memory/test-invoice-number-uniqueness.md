---
name: Test Invoice Number Uniqueness
description: Factory createTestInvoice must generate truly unique invoice numbers per call
---

# Test Invoice Number Uniqueness

**Rule:** Never derive test invoice numbers from `RUN_ID.slice(0, N)` where N is small. The `Date.now().toString(36)` prefix repeats every ~13 hours for the first 4 characters, causing `duplicate key value` errors when a prior failed test run left orphaned rows.

**Why:** `Date.now().toString(36)` in base36 changes ~36ms per last character. The first 4 chars only change every 36^3 ≈ 46,656 seconds ≈ 13 hours. If two test runs happen within that window, the invoice number is identical and the unique constraint fires.

**How to apply:** In `createTestInvoice` (factory.ts), generate invoice number per call:
```typescript
const unique = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const invoiceNumber = `INV-TEST/${yyyymm}/${unique}`;
```
This guarantees uniqueness even with millisecond precision + 4 random chars.
