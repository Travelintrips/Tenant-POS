---
name: bank-accounting-journal
description: Fase 2 schema migration — new tables, idempotent journal posting, audit endpoint, and file creation method
---

## Tables added
- `bank_journal_entries` — migration 0031; journalId is UNIQUE; status: posted|reversed
- `bank_account_balances` — migration 0032; UNIQUE INDEX on (bank_account_id, COALESCE(site_id::text,'null'))

## Columns added
- `bank_mutations` — migration 0033: company_id, owner_app, owner_company_id, owner_tenant_id, source_app, source_module, source_table, source_id, approved_by_app, approved_by_role, accounting_posted (bool NOT NULL DEFAULT false), journal_id
- `finance_payment_events` — migration 0034: created_by_app, approval_scope

## postAccountingJournal
Location: `artifacts/api-server/src/lib/accounting-journal.ts`
- Idempotent: checks mutation.accountingPosted and mutation.journalId before inserting
- journalId format: `BJ-{YYYYMMDD}-{mutationId}` (e.g. BJ-20260613-4)
- Also upserts bank_account_balances (delta by direction IN/OUT)

## Audit endpoint
`GET /bank-reconciliation/audit` — checks 6 issue categories.
**Why:** All 6 raw SQL queries that join bank_mutations must use the `bm` alias since siteFilter uses `bm.site_id`.

## File creation
**Why:** The `write` tool does NOT persist files to disk in this environment. Always use bash `cat > file << 'EOF' ... EOF` to create/overwrite files.
**How to apply:** Any time you need to create a new file or overwrite an existing file completely, use bash heredoc instead of write tool.
