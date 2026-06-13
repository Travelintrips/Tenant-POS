import { type Request, type Response, type NextFunction } from "express";

export interface AppContext {
  ownerApp: string;
  sourceApp: string;
  ownerCompanyId: number | null;
  ownerTenantId: number | null;
  role: string;
  isBizPortal: boolean;
  isFullAccess: boolean;
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

  const isBizPortal = role === "owner";
  const isFullAccess = isBizPortal;

  const hOwnerApp = req.headers["x-app-source"] as string | undefined;
  const ownerApp = (VALID_APPS as readonly string[]).includes(hOwnerApp ?? "")
    ? hOwnerApp!
    : "tenant_management";

  let sourceApp: string;
  if (role === "cashier") {
    sourceApp = "tenant_pos";
  } else if (role === "finance") {
    sourceApp = "tenant_management";
  } else {
    const h = req.headers["x-source-app"] as string | undefined;
    sourceApp = (VALID_SOURCE_APPS as readonly string[]).includes(h ?? "") ? h! : "tenant_management";
  }

  let ownerTenantId: number | null = null;
  if (!isFullAccess) {
    const h = req.headers["x-tenant-id"] as string | undefined;
    if (h) {
      const n = parseInt(h, 10);
      if (!isNaN(n) && n > 0) ownerTenantId = n;
    }
  }

  let ownerCompanyId: number | null = null;
  const hc = req.headers["x-company-id"] as string | undefined;
  if (hc) {
    const n = parseInt(hc, 10);
    if (!isNaN(n) && n > 0) ownerCompanyId = n;
  }

  req.appContext = { ownerApp, sourceApp, ownerCompanyId, ownerTenantId, role, isBizPortal, isFullAccess };
  next();
}
