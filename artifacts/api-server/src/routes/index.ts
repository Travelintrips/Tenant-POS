import { Router, type IRouter } from "express";
import healthRouter from "./health";
import tenantPosRouter from "./tenant-pos";

const router: IRouter = Router();

router.use(healthRouter);
router.use(tenantPosRouter);

export default router;
