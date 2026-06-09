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
