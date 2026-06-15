import type { Request } from "express";
import { db } from "@workspace/db";
import { auditLogsTable } from "@workspace/db/schema";

const SENSITIVE_KEYS = new Set([
  "password", "password_hash", "passwordHash",
  "token", "access_token", "accessToken", "refresh_token", "refreshToken",
  "secret", "api_key", "apiKey", "private_key", "privateKey",
  "session", "cookie", "authorization",
  "credit_card", "card_number", "cvv", "pin",
]);

function stripSensitive(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(stripSensitive);

  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(k.toLowerCase())) {
      clean[k] = "[REDACTED]";
    } else {
      clean[k] = stripSensitive(v);
    }
  }
  return clean;
}

export interface AuditOptions {
  action: string;
  entityType: string;
  entityId?: string | number | null;
  beforeData?: unknown;
  afterData?: unknown;
}

/**
 * Fire-and-forget audit log write.
 * Never throws — audit failures must not break the main API flow.
 */
export function logAudit(req: Request, opts: AuditOptions): void {
  const user = req.user as {
    dbId?: number;
    email?: string;
    name?: string;
  } | undefined;

  const ip =
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ??
    req.socket?.remoteAddress ??
    null;

  const rawDbId = user?.dbId;
  const numericUserId =
    typeof rawDbId === "number"
      ? rawDbId
      : rawDbId && /^\d+$/.test(String(rawDbId))
        ? Number(rawDbId)
        : null;

  // Ambil ownerTenantId dari appContext untuk tenant scoping
  const appCtx = (req as any).appContext as { ownerTenantId?: number | null } | undefined;
  const tenantId = appCtx?.ownerTenantId ?? null;

  const entry = {
    userId: numericUserId,
    userEmail: user?.email ?? null,
    userName: user?.name ?? null,
    action: opts.action,
    entityType: opts.entityType,
    entityId: opts.entityId !== undefined && opts.entityId !== null ? String(opts.entityId) : null,
    beforeData: opts.beforeData ? (stripSensitive(opts.beforeData) as Record<string, unknown>) : null,
    afterData: opts.afterData ? (stripSensitive(opts.afterData) as Record<string, unknown>) : null,
    siteId: (req as any).siteId ?? null,
    siteCode: (req as any).siteCode ?? null,
    tenantId,
    ipAddress: ip,
    userAgent: req.headers["user-agent"] ?? null,
  };

  db.insert(auditLogsTable)
    .values(entry)
    .then(() => {})
    .catch(() => {});
}
