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
import whatsappRouter from "./whatsapp";
import paymentProofRouter from "./payment-proof";
import draftAgreementsPublicRouter from "./draft-agreements-public";
import draftAgreementsRouter from "./draft-agreements";
import calonTenantRouter from "./calon-tenant";
import whatsappWebhookRouter from "./whatsapp-webhook";
import pendingPaymentsRouter from "./pending-payments";
import dashboardRouter from "./dashboard";
import systemStatusRouter from "./system-status";
import settingsRouter from "./settings";
import reconciliationRouter from "./reconciliation";
import bankReconciliationRouter from "./bank-reconciliation";
import paymentsRouter from "./payments";
import operationalExpensesRouter from "./operational-expenses";
import otherIncomeRouter from "./other-income";
import tenantSheetSyncRouter from "./tenant-sheet-sync";
import { requireAuth, requireNonTenantUser } from "../middlewares/auth";
import { siteContext } from "../middlewares/site-context";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(whatsappAuthRouter);

// Public routes (tidak perlu login)
router.use(configRouter);
router.use(paymentProofRouter);
router.use(draftAgreementsPublicRouter);
router.use(calonTenantRouter);
router.use(whatsappWebhookRouter); // Fonnte incoming message webhook

router.use(requireAuth);

router.use("/tenant-portal", tenantPortalRouter);

// Bank reconciliation diakses sebelum requireNonTenantUser agar tenant_user
// bisa akses data rekonsiliasi mereka sendiri (API sudah scope via appContextMiddleware)
router.use(bankReconciliationRouter);

router.use(requireNonTenantUser);

router.use(siteContext);

router.use(eventsRouter);
router.use(uploadsRouter);
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
router.use(pendingPaymentsRouter);
router.use(paymentsRouter);
router.use(dashboardRouter);
router.use(systemStatusRouter);
router.use(settingsRouter);
router.use(reconciliationRouter);
router.use(draftAgreementsRouter);
router.use(operationalExpensesRouter);
router.use(otherIncomeRouter);
router.use(tenantSheetSyncRouter);

export default router;
