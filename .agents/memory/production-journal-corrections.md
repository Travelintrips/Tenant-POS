---
name: Production journal corrections
description: Non-obvious ledger guards and ownership rules for tenant-payment corrections in production.
---

Create every corrective accounting entry as `draft`, insert all balanced lines, and only then change it to `posted`. Never disable the posted-line immutability guard.

**Why:** Production blocks adding or changing lines on an entry that is already posted. Reversal entries also share a uniqueness rule on company, source, and reference, so reusing the original receipt reference can collide with an earlier correction.

**How to apply:** Give each reversal a unique correction reference while retaining the original transaction reference in its description. Correct posted history through reversal/replacement entries, not amount updates.

Resolve a tenant payment's company from its linked invoice first; use the site's company only as a fallback when no payment/invoice ownership exists.

**Why:** A single operational site can contain invoices owned by more than one legal company, so site-only routing can post valid payments into the wrong ledger.

**How to apply:** For tenant-payment posting and reconciliation, validate payment company, invoice company, journal company, and COA company as one consistent chain.