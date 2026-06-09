import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import configRouter from "./config";
import tenantsRouter from "./tenants";
import bookingsRouter from "./bookings";
import tenantPosRouter from "./tenant-pos";
import laporanRouter from "./laporan";
import tenantInvoicesRouter from "./tenant-invoices";
import mallUnitsRouter from "./mall-units";
import auditLogsRouter from "./audit-logs";
import uploadsRouter from "./uploads";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);

router.use(requireAuth);

router.use(uploadsRouter);
router.use(configRouter);
router.use(tenantsRouter);
router.use(bookingsRouter);
router.use(tenantPosRouter);
router.use(laporanRouter);
router.use(tenantInvoicesRouter);
router.use(mallUnitsRouter);
router.use(auditLogsRouter);

export default router;
