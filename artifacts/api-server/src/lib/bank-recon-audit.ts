import type { Request } from "express";
import { db } from "@workspace/db";
import { bankReconAuditLogsTable } from "@workspace/db/schema";
import type { AppContext } from "../middlewares/app-context";

export interface BankReconAuditOpts {
  mutationId?: number | null;
  matchId?: number | null;
  financePaymentEventId?: number | null;
  journalId?: string | null;
  beforeValue?: unknown;
  afterValue?: unknown;
  metadata?: unknown;
  sourceModule?: string | null;
}

/**
 * Fire-and-forget dedicated audit for bank reconciliation actions.
 * Writes to bank_recon_audit_logs table. Never throws.
 */
export function logBankReconAudit(
  req: Request,
  ctx: AppContext,
  action: string,
  opts: BankReconAuditOpts = {}
): void {
  const user = req.user as { dbId?: string | number; email?: string; name?: string } | undefined;
  const ip =
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ??
    req.socket?.remoteAddress ??
    null;

  db.insert(bankReconAuditLogsTable).values({
    mutationId: opts.mutationId ?? null,
    matchId: opts.matchId ?? null,
    financePaymentEventId: opts.financePaymentEventId ?? null,
    journalId: opts.journalId ?? null,
    action,
    actionApp: ctx.ownerApp,
    actionUserId: user?.dbId != null ? String(user.dbId) : null,
    actionRole: ctx.role,
    ownerApp: ctx.ownerApp,
    ownerCompanyId: ctx.ownerCompanyId ?? null,
    ownerTenantId: ctx.ownerTenantId ?? null,
    sourceApp: ctx.sourceApp,
    sourceModule: opts.sourceModule ?? null,
    beforeValue: opts.beforeValue ? (opts.beforeValue as Record<string, unknown>) : null,
    afterValue: opts.afterValue ? (opts.afterValue as Record<string, unknown>) : null,
    metadata: opts.metadata ? (opts.metadata as Record<string, unknown>) : null,
    ipAddress: ip,
    userAgent: req.headers["user-agent"] ?? null,
  }).then(() => {}).catch(() => {});
}
