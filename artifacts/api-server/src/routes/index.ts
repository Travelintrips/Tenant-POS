import { Router, type IRouter } from "express";
import healthRouter from "./health";
import tenantsRouter from "./tenants";
import bookingsRouter from "./bookings";
import tenantPosRouter from "./tenant-pos";

const router: IRouter = Router();

router.use(healthRouter);
router.use(tenantsRouter);
router.use(bookingsRouter);
router.use(tenantPosRouter);

export default router;
