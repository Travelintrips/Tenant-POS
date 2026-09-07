import { type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import {
  companiesTable,
  mallSitesTable,
  tenantsTable,
  userSiteAccessTable,
} from "@workspace/db/schema";
import { and, eq, inArray } from "drizzle-orm";

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

export async function appContextMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
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
  // KEAMANAN: tenant_user TIDAK boleh claim isBizPortal via header — strict isolation.
  const NON_TENANT_ROLES = ["owner", "admin", "finance", "cashier"] as const;
  const canClaimBizportal = (NON_TENANT_ROLES as readonly string[]).includes(role);
  const isBizPortal = role === "owner" || (canClaimBizportal && ownerApp === "bizportal");

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
  // A company header is only a requested context. It is never accepted as proof
  // of ownership: resolve it against the selected site, the user's tenant
  // session, or explicit site access first.
  let ownerCompanyId: number | null = null;
  const hc = req.headers["x-company-id"] as string | undefined;
  const requestedCompanyId = hc == null || hc === ""
    ? null
    : Number(hc);
  if (
    requestedCompanyId != null
    && (!Number.isInteger(requestedCompanyId) || requestedCompanyId <= 0)
  ) {
    res.status(400).json({ error: "X-Company-Id tidak valid" });
    return;
  }

  try {
    const selectedSiteId = Number.isInteger(req.siteId) && req.siteId > 0 ? req.siteId : null;

    if (selectedSiteId != null) {
      const [site] = await db
        .select({ companyId: mallSitesTable.companyId })
        .from(mallSitesTable)
        .where(eq(mallSitesTable.id, selectedSiteId));

      if (!site) {
        res.status(403).json({ error: "Konteks site tidak valid" });
        return;
      }
      if (
        requestedCompanyId != null
        && site.companyId !== requestedCompanyId
      ) {
        res.status(403).json({ error: "Company tidak sesuai dengan site yang dipilih" });
        return;
      }
      ownerCompanyId = site.companyId ?? null;
    } else if (requestedCompanyId != null) {
      const [company] = await db
        .select({ id: companiesTable.id })
        .from(companiesTable)
        .where(eq(companiesTable.id, requestedCompanyId));
      if (!company) {
        res.status(403).json({ error: "Company tidak ditemukan" });
        return;
      }

      if (role === "owner" || role === "admin") {
        // These roles legitimately have portfolio-wide access, but selecting a
        // company still creates a strict company context for downstream routes.
        ownerCompanyId = company.id;
      } else if (role === "tenant_user") {
        const tenantIds = (req.user.tenantAccess ?? [])
          .filter((access) => access.status == null || access.status !== "inactive")
          .map((access) => access.tenantId);
        const [ownedTenant] = tenantIds.length > 0
          ? await db
              .select({ id: tenantsTable.id })
              .from(tenantsTable)
              .where(and(
                inArray(tenantsTable.id, tenantIds),
                eq(tenantsTable.companyId, company.id),
              ))
          : [];
        if (!ownedTenant) {
          res.status(403).json({ error: "Akses company ditolak" });
          return;
        }
        ownerCompanyId = company.id;
      } else {
        const [companySiteAccess] = await db
          .select({ siteId: userSiteAccessTable.siteId })
          .from(userSiteAccessTable)
          .innerJoin(mallSitesTable, eq(userSiteAccessTable.siteId, mallSitesTable.id))
          .where(and(
            eq(userSiteAccessTable.userId, req.user.dbId),
            eq(mallSitesTable.companyId, company.id),
          ));
        if (!companySiteAccess) {
          res.status(403).json({ error: "Akses company ditolak" });
          return;
        }
        ownerCompanyId = company.id;
      }
    }
  } catch (err) {
    next(err);
    return;
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
