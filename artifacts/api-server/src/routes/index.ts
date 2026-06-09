import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import configRouter from "./config";
import tenantsRouter from "./tenants";
import bookingsRouter from "./bookings";
import tenantPosRouter from "./tenant-pos";
import laporanRouter from "./laporan";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);

router.use((req: Request, res: Response, next: NextFunction) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Tidak terautentikasi" });
    return;
  }
  next();
});

router.use(configRouter);
router.use(tenantsRouter);
router.use(bookingsRouter);
router.use(tenantPosRouter);
router.use(laporanRouter);

export default router;
