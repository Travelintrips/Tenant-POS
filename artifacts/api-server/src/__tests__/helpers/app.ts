import express, { type Request, type Response, type NextFunction } from "express";
import tenantInvoicesRouter from "../../routes/tenant-invoices";
import laporanRouter from "../../routes/laporan";

export type TestRole = "owner" | "admin" | "finance" | "kasir";

export function createTestApp(role: TestRole = "owner") {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = {
      id: "test-user-id",
      dbId: 1,
      email: "test@example.com",
      name: "Test User",
      avatar: null,
      role,
    };
    (req as any).isAuthenticated = () => true;
    (req as any).siteId = 1;
    (req as any).siteCode = "TOD_M1_BANDARA";
    (req as any).log = {
      info: (...a: unknown[]) => { if (process.env.TEST_VERBOSE) console.info("[req.log.info]", ...a); },
      error: (...a: unknown[]) => console.error("[req.log.error]", ...a),
      warn: (...a: unknown[]) => console.warn("[req.log.warn]", ...a),
      debug: () => {},
      trace: () => {},
      fatal: (...a: unknown[]) => console.error("[req.log.fatal]", ...a),
      child: () => (req as any).log,
    };
    next();
  });

  app.use("/api", tenantInvoicesRouter);
  app.use("/api", laporanRouter);

  return app;
}
