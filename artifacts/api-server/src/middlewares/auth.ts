import { type Request, type Response, type NextFunction } from "express";
import { USER_ROLES, type UserRole } from "@workspace/db/schema";

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Tidak terautentikasi" });
    return;
  }
  next();
}

export function requireRole(role: UserRole) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Tidak terautentikasi" });
      return;
    }
    if (req.user?.role !== role) {
      res.status(403).json({ error: "Akses ditolak. Peran Anda tidak memiliki izin." });
      return;
    }
    next();
  };
}

export function requireAnyRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
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
    next();
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
