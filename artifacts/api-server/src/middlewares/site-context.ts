import { type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { mallSitesTable, userSiteAccessTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

declare global {
  namespace Express {
    interface Request {
      siteId: number;
      siteCode: string;
    }
  }
}

const DEFAULT_SITE_CODE = "TOD_M1_BANDARA";

// Simple in-memory cache for sites (TTL 5 menit)
let _sitesCache: { id: number; code: string; name: string }[] | null = null;
let _sitesCacheAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function getAllSites() {
  if (_sitesCache && Date.now() - _sitesCacheAt < CACHE_TTL_MS) return _sitesCache;
  const rows = await db.select({ id: mallSitesTable.id, code: mallSitesTable.code, name: mallSitesTable.name }).from(mallSitesTable);
  _sitesCache = rows;
  _sitesCacheAt = Date.now();
  return rows;
}

export function clearSitesCache() {
  _sitesCache = null;
}

/**
 * Middleware: resolves active site for the request.
 *
 * Priority (decreasing):
 *   1. x-site-id header (integer site ID)
 *   2. x-site-code header (string code, e.g. "TOD_M1_BANDARA")
 *   3. ?siteId= query param
 *   4. Default: TOD_M1_BANDARA
 *
 * Authorization:
 *   - owner: any site
 *   - others: must have a row in user_site_access for the resolved site
 *             (if user has NO access rows at all → allow default site for backward compat)
 */
export async function siteContext(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const sites = await getAllSites();
    if (sites.length === 0) {
      // Sites table not yet seeded — attach a dummy and continue
      req.siteId = 0;
      req.siteCode = DEFAULT_SITE_CODE;
      return next();
    }

    const defaultSite = sites.find((s) => s.code === DEFAULT_SITE_CODE) ?? sites[0];

    // Resolve requested site
    let resolvedSite = defaultSite;

    const headerSiteId = req.headers["x-site-id"];
    const headerSiteCode = req.headers["x-site-code"];
    const querySiteId = req.query.siteId;

    if (headerSiteId) {
      const id = Number(headerSiteId);
      const found = sites.find((s) => s.id === id);
      if (found) resolvedSite = found;
    } else if (headerSiteCode) {
      const code = String(headerSiteCode);
      if (code === "ALL") {
        // "Semua" mode — no site filter; routes handle siteId=0 as "all sites"
        req.siteId = 0;
        req.siteCode = "ALL";
        return next();
      }
      const found = sites.find((s) => s.code === code);
      if (found) resolvedSite = found;
    } else if (querySiteId) {
      const id = Number(querySiteId);
      const found = sites.find((s) => s.id === id);
      if (found) resolvedSite = found;
    }

    const user = req.user as { dbId?: number; role?: string } | undefined;
    const role = user?.role ?? "cashier";

    // Owner bypasses site access check
    if (role !== "owner" && user?.dbId) {
      const dbId = user.dbId;

      // Check if user has ANY site access rows
      const allAccess = await db
        .select({ siteId: userSiteAccessTable.siteId })
        .from(userSiteAccessTable)
        .where(eq(userSiteAccessTable.userId, dbId));

      if (allAccess.length > 0) {
        // User has explicit access rows — verify they can access the resolved site
        const hasAccess = allAccess.some((a) => a.siteId === resolvedSite.id);
        if (!hasAccess) {
          res.status(403).json({
            error: "Akses ditolak ke site ini. Hubungi administrator untuk mendapat akses.",
            siteCode: resolvedSite.code,
          });
          return;
        }
      }
      // If no access rows at all → backward compat: allow default site
    }

    req.siteId = resolvedSite.id;
    req.siteCode = resolvedSite.code;
    next();
  } catch (err) {
    // Site context failure must not break API — use default
    const sites = _sitesCache;
    const def = sites?.find((s) => s.code === DEFAULT_SITE_CODE) ?? sites?.[0];
    req.siteId = def?.id ?? 0;
    req.siteCode = def?.code ?? DEFAULT_SITE_CODE;
    next();
  }
}
