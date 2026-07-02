import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  tenantsTable,
  tenantBookingsTable,
  tenantInvoicesTable,
  tenantPaymentsTable,
  tenantUserAccessTable,
  mallSitesTable,
} from "@workspace/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { requireTenantUser, getTenantIdsForUser } from "../middlewares/auth";

const router: IRouter = Router();

router.use(requireTenantUser);

router.get("/me", async (req, res) => {
  const user = req.user;
  if (!user) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }
  const access = await db
    .select({
      tenantId: tenantUserAccessTable.tenantId,
      siteId: tenantUserAccessTable.siteId,
      accessLevel: tenantUserAccessTable.accessLevel,
      status: tenantUserAccessTable.status,
      tenantName: tenantsTable.businessName,
      ownerName: tenantsTable.ownerName,
      tenantStatus: tenantsTable.status,
      boothNumber: tenantsTable.boothNumber,
      areaName: tenantsTable.areaName,
      siteName: mallSitesTable.name,
    })
    .from(tenantUserAccessTable)
    .innerJoin(tenantsTable, eq(tenantUserAccessTable.tenantId, tenantsTable.id))
    .innerJoin(mallSitesTable, eq(tenantUserAccessTable.siteId, mallSitesTable.id))
    .where(
      and(
        eq(tenantUserAccessTable.userId, String(user.dbId)),
        eq(tenantUserAccessTable.status, "active"),
      ),
    );

  res.json({
    id: user.id,
    dbId: user.dbId,
    name: user.name,
    phoneNumber: user.phoneNumber,
    email: user.email,
    role: user.role,
    tenantAccess: access,
  });
});

router.get("/bookings", async (req, res) => {
  const tenantIds = getTenantIdsForUser(req);
  if (tenantIds.length === 0) {
    res.json([]);
    return;
  }

  const bookings = await db
    .select()
    .from(tenantBookingsTable)
    .where(inArray(tenantBookingsTable.tenantId, tenantIds))
    .orderBy(tenantBookingsTable.createdAt);

  res.json(bookings);
});

router.get("/invoices", async (req, res) => {
  const tenantIds = getTenantIdsForUser(req);
  if (tenantIds.length === 0) {
    res.json([]);
    return;
  }

  const invoices = await db
    .select()
    .from(tenantInvoicesTable)
    .where(inArray(tenantInvoicesTable.tenantId, tenantIds))
    .orderBy(tenantInvoicesTable.createdAt);

  res.json(invoices);
});

router.get("/payments", async (req, res) => {
  const tenantIds = getTenantIdsForUser(req);
  if (tenantIds.length === 0) {
    res.json([]);
    return;
  }

  const payments = await db
    .select()
    .from(tenantPaymentsTable)
    .where(inArray(tenantPaymentsTable.tenantId, tenantIds))
    .orderBy(tenantPaymentsTable.createdAt);

  res.json(payments);
});

export default router;
