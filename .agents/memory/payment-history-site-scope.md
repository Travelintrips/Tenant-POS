---
name: Payment history site scope
description: Payment history must resolve site from invoice or tenant before falling back to the payment row.
---

Payment history site filtering should use `coalesce(invoice.site_id, tenant.site_id, payment.site_id)` rather than `payment.site_id` alone.

**Why:** Legacy duplicate POS rows can retain an old site ID while the real invoice payment and tenant belong to the current site; filtering only the payment row hides the approved payment.

**How to apply:** When listing or resolving related tenant payments, join invoices and tenants and use the linked site expression consistently with payment detail/proof authorization.