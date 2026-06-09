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
import eventsRouter from "./events";
import sitesRouter from "./sites";
import whatsappAuthRouter from "./whatsapp-auth";
import tenantPortalRouter from "./tenant-portal";
import tenantUsersRouter from "./tenant-users";
import { requireAuth, requireNonTenantUser } from "../middlewares/auth";
import whatsappRouter from "./whatsapp";
import { siteContext } from "../middlewares/site-context";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(whatsappAuthRouter);

router.use(requireAuth);

router.use("/tenant-portal", tenantPortalRouter);

router.use(requireNonTenantUser);

router.use(siteContext);

router.use(eventsRouter);
router.use(uploadsRouter);
router.use(configRouter);
router.use(sitesRouter);
router.use(tenantsRouter);
router.use(tenantUsersRouter);
router.use(bookingsRouter);
router.use(tenantPosRouter);
router.use(laporanRouter);
router.use(tenantInvoicesRouter);
router.use(mallUnitsRouter);
router.use(auditLogsRouter);
router.use(whatsappRouter);

export default router;
