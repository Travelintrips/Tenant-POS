import { type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { mallSitesTable, userSiteAccessTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

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
const USER_ACCESS_CACHE_TTL_MS = 60 * 1000;
const _userAccessCache = new Map<string, { siteIds: number[]; expiresAt: number }>();

async function getUserSiteIds(userId: string): Promise<number[]> {
  const cached = _userAccessCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.siteIds;

  const rows = await db
    .select({ siteId: userSiteAccessTable.siteId })
    .from(userSiteAccessTable)
    .where(eq(userSiteAccessTable.userId, userId));

  const siteIds = rows.map((row) => row.siteId);
  _userAccessCache.set(userId, {
    siteIds,
    expiresAt: Date.now() + USER_ACCESS_CACHE_TTL_MS,
  });
  return siteIds;
}

export function invalidateUserSiteAccessCache(userId?: string) {
  if (userId) _userAccessCache.delete(String(userId));
  else _userAccessCache.clear();
}

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
      res.status(503).json({ error: "Konfigurasi site belum tersedia" });
      return;
    }

    const defaultSite = sites.find((s) => s.code === DEFAULT_SITE_CODE) ?? sites[0];
    const user = req.user as { dbId?: number | string; role?: string } | undefined;
    const role = user?.role ?? "";
    const dbId = user?.dbId != null ? String(user.dbId) : "";

    const headerSiteId = req.headers["x-site-id"];
    const headerSiteCode = req.headers["x-site-code"];
    const querySiteId = req.query.siteId;
    const hasExplicitSiteSelection =
      headerSiteId != null || headerSiteCode != null || querySiteId != null;

    let resolvedSite = defaultSite;

    if (headerSiteId != null) {
      const id = Number(headerSiteId);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ error: "x-site-id tidak valid" });
        return;
      }
      const found = sites.find((s) => s.id === id);
      if (!found) {
        res.status(404).json({ error: "Site tidak ditemukan" });
        return;
      }
      resolvedSite = found;
    } else if (headerSiteCode != null) {
      const code = String(headerSiteCode).trim();
      if (code === "ALL") {
        if (role !== "owner") {
          res.status(403).json({ error: "Mode semua site hanya tersedia untuk owner." });
          return;
        }
        req.siteId = 0;
        req.siteCode = "ALL";
        res.setHeader("Vary", "x-site-id, x-site-code");
        next();
        return;
      }

      const found = sites.find((s) => s.code === code);
      if (!found) {
        res.status(404).json({ error: "Site tidak ditemukan" });
        return;
      }
      resolvedSite = found;
    } else if (querySiteId != null) {
      const id = Number(querySiteId);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ error: "siteId tidak valid" });
        return;
      }
      const found = sites.find((s) => s.id === id);
      if (!found) {
        res.status(404).json({ error: "Site tidak ditemukan" });
        return;
      }
      resolvedSite = found;
    }

    if (role !== "owner") {
      if (!dbId) {
        res.status(403).json({ error: "Identitas user tidak valid untuk akses site." });
        return;
      }

      const allowedSiteIds = await getUserSiteIds(dbId);

      if (allowedSiteIds.length > 0) {
        const hasAccess = allowedSiteIds.includes(resolvedSite.id);
        if (!hasAccess) {
          res.status(403).json({
            error: "Akses ditolak ke site ini. Hubungi administrator untuk mendapat akses.",
            siteCode: resolvedSite.code,
          });
          return;
        }
      } else if (resolvedSite.id !== defaultSite.id || (hasExplicitSiteSelection && resolvedSite.id !== defaultSite.id)) {
        // Backward compatibility: akun lama tanpa user_site_access tetap dapat
        // memakai site default, tetapi tidak boleh memilih site lain.
        res.status(403).json({
          error: "Akses site belum dikonfigurasi untuk akun ini.",
          siteCode: resolvedSite.code,
        });
        return;
      }
    }

    req.siteId = resolvedSite.id;
    req.siteCode = resolvedSite.code;
    res.setHeader("Vary", "x-site-id, x-site-code");
    next();
  } catch (err) {
    // Authorization context harus fail-closed. Gangguan DB/cache tidak boleh
    // berubah menjadi akses default yang melewati validasi site.
    res.status(503).json({ error: "Konteks site tidak dapat divalidasi saat ini." });
  }
}
