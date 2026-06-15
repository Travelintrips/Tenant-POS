import { type Request, type Response, type NextFunction } from "express";

/**
 * AppContext — konteks aplikasi untuk setiap request yang terautentikasi.
 *
 * isBizPortal = true  → user berasal dari BizPortal (owner ATAU ownerApp=bizportal)
 * isFullAccess = true → user adalah super admin (role=owner) — tidak ada filter tenant/sourceApp
 *
 * ownerTenantId:
 *   - null untuk owner (isFullAccess) → lihat semua tenant
 *   - dari X-Tenant-Id header HANYA untuk BizPortal (non-fullAccess) → scope ke satu tenant
 *   - dari tenantAccess session untuk tenant_user → strict tenant isolation
 *   - null untuk admin/finance/cashier non-BizPortal → lihat semua, dibatasi sourceApp
 *
 * sourceApp (untuk tagging import dan filter tampilan):
 *   - "tenant_pos"        → cashier (selalu, tidak bisa di-override)
 *   - "tenant_management" → finance non-BizPortal (selalu)
 *   - dari X-Source-App   → BizPortal/admin (opsional, default "tenant_management")
 *   - null via matchCtx   → BizPortal/owner saat matching (lihat semua sourceApp)
 *
 * sourceAppFilterBypass = true → tidak menerapkan filter sourceApp pada query
 *   (true untuk owner dan BizPortal finance/admin)
 */
export interface AppContext {
  ownerApp: string;
  sourceApp: string;
  ownerCompanyId: number | null;
  ownerTenantId: number | null;
  role: string;
  isBizPortal: boolean;
  isFullAccess: boolean;
  /** true → query tidak dibatasi oleh sourceApp (BizPortal bisa lihat semua app) */
  sourceAppFilterBypass: boolean;
}

declare global {
  namespace Express {
    interface Request {
      appContext?: AppContext;
    }
  }
}

const VALID_APPS = ["tenant_management", "tenant_pos", "bizportal"] as const;
const VALID_SOURCE_APPS = ["tenant_management", "tenant_pos"] as const;

export function appContextMiddleware(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) { next(); return; }

  const role = (req.user.role as string) ?? "admin";

  // ── ownerApp: dari header X-App-Source ───────────────────────────────────────
  const hOwnerApp = req.headers["x-app-source"] as string | undefined;
  const ownerApp = (VALID_APPS as readonly string[]).includes(hOwnerApp ?? "")
    ? hOwnerApp!
    : "tenant_management";

  // ── isBizPortal: owner ATAU request dari app BizPortal ───────────────────────
  // - owner/super_admin: selalu BizPortal
  // - ownerApp=bizportal: Finance/Admin dari portal pusat
  const isBizPortal = role === "owner" || ownerApp === "bizportal";

  // ── isFullAccess: hanya owner (super admin) ─────────────────────────────────
  const isFullAccess = role === "owner";

  // ── sourceApp: untuk tagging data import ───────────────────────────────────
  // - cashier: selalu tenant_pos (tidak bisa di-override)
  // - finance non-BizPortal: selalu tenant_management
  // - BizPortal Finance/Admin/Owner: dari X-Source-App header atau default
  let sourceApp: string;
  if (role === "cashier") {
    sourceApp = "tenant_pos";
  } else if (role === "finance" && !isBizPortal) {
    // Finance Tenant App → hanya bisa akses tenant_management
    sourceApp = "tenant_management";
  } else {
    // BizPortal (semua role) atau Admin/Finance di konteks lain
    const h = req.headers["x-source-app"] as string | undefined;
    sourceApp = (VALID_SOURCE_APPS as readonly string[]).includes(h ?? "") ? h! : "tenant_management";
  }

  // ── sourceAppFilterBypass: BizPortal boleh lihat semua source_app ────────────
  // cashier: tidak bypass (hanya tenant_pos)
  // finance non-BizPortal: tidak bypass (hanya tenant_management)
  // BizPortal (owner/finance/admin): bypass → lihat semua sourceApp
  const sourceAppFilterBypass = isBizPortal;

  // ── ownerTenantId: isolasi tenant ───────────────────────────────────────────
  let ownerTenantId: number | null = null;
  if (isFullAccess) {
    // owner: tidak ada filter tenant
    ownerTenantId = null;
  } else if (isBizPortal) {
    // BizPortal non-owner: boleh scope ke satu tenant via X-Tenant-Id
    // (BizPortal operator mengirim header ini untuk filter per tenant)
    const h = req.headers["x-tenant-id"] as string | undefined;
    if (h) {
      const n = parseInt(h, 10);
      if (!isNaN(n) && n > 0) ownerTenantId = n;
    }
  } else if (role === "tenant_user") {
    // tenant_user: strict isolation dari session tenantAccess
    // Ambil tenant pertama yang aktif dari session
    const tenantIds = (req.user as any).tenantAccess
      ?.filter((a: any) => a.status == null || a.status !== "inactive")
      ?.map((a: any) => a.tenantId as number) ?? [];
    ownerTenantId = tenantIds[0] ?? null;
  }
  // finance/cashier/admin non-BizPortal: ownerTenantId = null
  // → mereka melihat semua tenant dalam sourceApp mereka
  // (mall staff memiliki akses lintas tenant dalam app mereka)

  // ── ownerCompanyId ───────────────────────────────────────────────────────────
  let ownerCompanyId: number | null = null;
  const hc = req.headers["x-company-id"] as string | undefined;
  if (hc) {
    const n = parseInt(hc, 10);
    if (!isNaN(n) && n > 0) ownerCompanyId = n;
  }

  req.appContext = {
    ownerApp,
    sourceApp,
    ownerCompanyId,
    ownerTenantId,
    role,
    isBizPortal,
    isFullAccess,
    sourceAppFilterBypass,
  };
  next();
}
