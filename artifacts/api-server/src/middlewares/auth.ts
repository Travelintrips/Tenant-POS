import { type Request, type Response, type NextFunction } from "express";
import { USER_ROLES, type UserRole } from "@workspace/db/schema";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

// ─── User status cache (avoid DB hit on every request) ────────────────────────
interface CachedStatus {
  status: string;
  forceLogoutAt: Date | null;
  expiresAt: number;
}
const userStatusCache = new Map<string, CachedStatus>();
const CACHE_TTL_MS = 30_000;

async function getCachedUserStatus(userId: string): Promise<CachedStatus | null> {
  const cached = userStatusCache.get(userId);
  if (cached && Date.now() < cached.expiresAt) return cached;

  try {
    const [row] = await db
      .select({ status: usersTable.status, forceLogoutAt: usersTable.forceLogoutAt })
      .from(usersTable)
      .where(eq(usersTable.id, userId));
    if (!row) return null;
    const entry: CachedStatus = {
      status: row.status,
      forceLogoutAt: row.forceLogoutAt ?? null,
      expiresAt: Date.now() + CACHE_TTL_MS,
    };
    userStatusCache.set(userId, entry);
    return entry;
  } catch {
    return null;
  }
}

export function invalidateUserStatusCache(userId: string) {
  userStatusCache.delete(userId);
}

// ─── Middleware ────────────────────────────────────────────────────────────────

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: "Tidak terautentikasi" });
    return;
  }

  const userId = req.user.dbId;
  const cached = await getCachedUserStatus(userId);

  if (cached) {
    if (cached.status === "inactive" || cached.status === "blocked") {
      req.logout(() => {});
      res.status(401).json({ error: "Akun Anda tidak aktif. Hubungi administrator." });
      return;
    }
    if (cached.forceLogoutAt) {
      const loginAt = req.user.loginAt ? new Date(req.user.loginAt) : null;
      if (!loginAt || loginAt < cached.forceLogoutAt) {
        req.logout(() => {});
        res.status(401).json({ error: "Sesi Anda telah direset. Silakan login kembali." });
        return;
      }
    }
  }

  next();
}

export function requireRole(role: UserRole) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Tidak terautentikasi" });
      return;
    }
    if (req.user?.role !== role) {
      res.status(403).json({ error: "Akses ditolak. Peran Anda tidak memiliki izin." });
      return;
    }
    await requireAuth(req, res, next);
  };
}

export function requireAnyRole(...roles: UserRole[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Tidak terautentikasi" });
      return;
    }
    const userRole = req.user?.role as UserRole | undefined;
    if (!userRole || !roles.includes(userRole)) {
      res.status(403).json({
        error: "Akses ditolak. Peran Anda tidak memiliki izin untuk tindakan ini.",
        required: roles,
        current: userRole ?? null,
      });
      return;
    }
    await requireAuth(req, res, next);
  };
}

export function requireNonTenantUser(req: Request, res: Response, next: NextFunction): void {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Tidak terautentikasi" });
    return;
  }
  if (req.user?.role === "tenant_user") {
    res.status(403).json({ error: "Akses ditolak untuk akun tenant." });
    return;
  }
  next();
}

export function requireTenantUser(req: Request, res: Response, next: NextFunction): void {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Tidak terautentikasi" });
    return;
  }
  if (req.user?.role !== "tenant_user") {
    res.status(403).json({ error: "Hanya untuk akun tenant." });
    return;
  }
  next();
}

export function requireTenantAccess(tenantId: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Tidak terautentikasi" });
      return;
    }
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: "Tidak terautentikasi" });
      return;
    }
    if (user.role !== "tenant_user") {
      next();
      return;
    }
    const allowed = user.tenantAccess?.some(
      (a) => a.tenantId === tenantId && (a.status == null || a.status !== "inactive"),
    );
    if (!allowed) {
      res.status(403).json({ error: "Anda tidak memiliki akses ke tenant ini." });
      return;
    }
    next();
  };
}

export function getTenantIdsForUser(req: Request): number[] {
  const user = req.user;
  if (!user || user.role !== "tenant_user") return [];
  return user.tenantAccess?.map((a) => a.tenantId) ?? [];
}
