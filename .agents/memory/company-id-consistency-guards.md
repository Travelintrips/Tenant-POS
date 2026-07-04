---
name: company-id-consistency-guards
description: DB-level triggers enforcing company_id consistency across tenants/accounting_entries/accounting_payments
---

Root cause of a recurring bug: multiple code paths matched companies by fragile text (mall_sites.company_name vs companies.name, ILIKE keyword matching) instead of joining on the reliable `mall_sites.company_id` FK. This caused tenant rent payment journals to post under the wrong company.

Fix applied at two layers:
1. Code: all lookups now JOIN directly on `mall_sites.company_id = companies.id` (no text matching).
2. DB: BEFORE INSERT/UPDATE triggers (migration 0086_company_id_consistency_guards) reject writes where:
   - `tenants.company_id` != `mall_sites.company_id` for its `site_id`
   - `accounting_entries.company_id` != `accounting_journals.company_id` for its `journal_id`
   - `accounting_payments.company_id` != `accounting_entries.company_id` for its `entry_id`

**Why:** user explicitly wanted a system-level guarantee (not just a one-off fix) so this class of bug can never silently reoccur, even from future code mistakes or manual DB edits.

**How to apply:** if adding new company-scoped tables/columns, follow the same pattern — validate company_id against the parent FK's company_id via a trigger, don't rely on app-code discipline alone. Note: `accounting_entries` also has separate immutability triggers (fn_block_posted_entry_update etc.) — fixing a posted row requires cancel+recreate, not direct UPDATE.
