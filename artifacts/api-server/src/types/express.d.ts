import type { AppContext } from "../middlewares/app-context";

// Extend Express Request globally so middleware-injected properties
// are typed without requiring `as any` casts across routes.
declare global {
  namespace Express {
    interface Request {
      /** Site ID injected by site-context middleware. 0 = no site filter (owner). */
      siteId: number;
      /** Authenticated user from session. */
      user?: {
        id: string;
        name: string;
        role: string;
        phoneNumber?: string | null;
        siteId?: number | null;
      };
      /** Full app context (sourceApp, ownerTenantId, etc.) injected by appContextMiddleware. */
      appContext?: AppContext;
    }
  }
}

export {};
