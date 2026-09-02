---
name: Posted ledger corrections
description: Safe correction pattern for approved payments whose accounting journal has already been posted
---

Posted `accounting_entries` and their lines are immutable. Correct a wrong approved payment by voiding the original entry, posting an equal-and-opposite reversal, and posting a replacement entry with the corrected amount. Keep the original OCR/extraction value as audit evidence.

**Why:** Direct updates to posted totals and lines are rejected by database immutability triggers. A reversal preserves the audit trail and keeps debits and credits balanced.

**How to apply:** Synchronize the operational payment, invoice balance, receipt, finance event, accounting payment, reversal, and replacement entry in one transaction. Use unique correction correlation IDs and verify both header and line totals after commit.