---
name: bank-recon-e2e
description: Bank reconciliation flow — e2e test results, API contract, dan audit gaps yang sudah dipatch
---

## Status
Semua 8 migrasi (0028–0036) sudah applied. 6 tabel bank recon aktif di Supabase.

## API Contract (semua di bawah `/api/bank-reconciliation/`)

| Endpoint | Method | Body | Catatan |
|---|---|---|---|
| `/import` | POST | `{rows: string[][], bankAccountId?}` | rows[0] = header CSV |
| `/mutations?siteId=N` | GET | — | Status: unmatched/matched/approved/rejected/duplicate_need_review |
| `/matches/:mutationId` | GET | — | Returns `{mutation, matches:[]}` |
| `/run-matching` | POST | `{siteId}` | Auto-match mutations ke invoices/payments |
| `/:mutationId/manual-match` | POST | `{candidateType, candidateId}` | Langsung approved (tidak perlu /approve lagi) |
| `/:mutationId/approve` | POST | `{matchId}` | Membuat journal entry + payment; idempotent (alreadyPosted flag) |
| `/:mutationId/reject` | POST | `{reason?}` | Tidak membuat journal |
| `/kpi` | GET | — | Statistik mutations/invoices/payments |
| `/audit-logs` | GET | — | 14 entries bank recon audit logs |
| `/audit` | GET | — | Health check (totalIssues, scopedBy) |

## Alur Manual Match vs Approve
- **manual-match**: create match (status=candidate) → langsung approved dalam 1 transaksi. TIDAK membuat journal entry.
- **/approve** dengan matchId: membuat journal entry (`BJ-{date}-{mutId}`), membuat payment record, update invoice paidAmount. **Idempotent** via `alreadyPosted` flag.

## Audit Gaps yang Dipatch
1. Duplikat route `/rekonsiliasi` di App.tsx dihapus (baris 225-231)
2. `audit_logs.tenant_id INTEGER` ditambah via migration 0036 (ALTER TABLE IF NOT EXISTS)
3. `logAudit` di `audit.ts` sekarang mengisi `tenantId` dari `req.appContext.ownerTenantId`
4. Audit-logs route menggunakan `eq(auditLogsTable.tenantId, ownerTenantId)` untuk tenant scoping

## Badge Akses Penuh
Di `bank-rekonsiliasi.tsx` header, badge hijau "Akses Penuh" muncul ketika `appCtx.isFullAccess === true` (role=owner)

## E2E Test Summary (2026-06-13)
- Import: ✓ (imported=1, autoMatched=0, duplicates=1 untuk key sama)
- Manual match: ✓ (success:true, mutation.status=approved)
- Approve matchId=6: ✓ → journalId=BJ-20260612-13, newPaymentId=218
- Approve matchId=5: ✓ → journalId=BJ-20260612-11, newPaymentId=219
- Idempotency approve: ✓ → alreadyPosted=true
- Reject: ✓ (mutations 9+14 berhasil di-reject)
- KPI final: approved=3, rejected=3, duplicate_need_review=1

**Why:** Harus pakai `rows: string[][]` (bukan JSON objects) untuk import endpoint.
