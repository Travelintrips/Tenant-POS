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
import {
  downloadFromStorage,
  getPaymentProofBucket,
  getStorageObjectPath,
} from "../lib/supabase-storage";

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

  const proofRoute = (id: number) => `/api/tenant-portal/payments/${id}/proof`;
  res.json(payments.map((payment) => ({
    ...payment,
    proofUrl: payment.proofUrl || payment.proofImageUrl
      ? proofRoute(payment.id)
      : null,
    proofImageUrl: payment.proofUrl || payment.proofImageUrl
      ? proofRoute(payment.id)
      : null,
  })));
});

router.get("/payments/:id/proof", async (req, res) => {
  const paymentId = Number(req.params.id);
  if (!Number.isInteger(paymentId) || paymentId <= 0) {
    res.status(400).json({ error: "ID pembayaran tidak valid" });
    return;
  }

  const tenantIds = getTenantIdsForUser(req);
  if (tenantIds.length === 0) {
    res.status(404).json({ error: "Bukti pembayaran tidak ditemukan" });
    return;
  }

  const [payment] = await db
    .select({
      id: tenantPaymentsTable.id,
      tenantId: tenantPaymentsTable.tenantId,
      proofUrl: tenantPaymentsTable.proofUrl,
      proofImageUrl: tenantPaymentsTable.proofImageUrl,
    })
    .from(tenantPaymentsTable)
    .where(and(
      eq(tenantPaymentsTable.id, paymentId),
      inArray(tenantPaymentsTable.tenantId, tenantIds),
    ))
    .limit(1);

  const storedUrl = payment?.proofUrl ?? payment?.proofImageUrl;
  if (!storedUrl) {
    res.status(404).json({ error: "Bukti pembayaran tidak ditemukan" });
    return;
  }

  const bucket = getPaymentProofBucket();
  const filePath = getStorageObjectPath(storedUrl, bucket);
  if (!filePath) {
    res.status(422).json({
      error: `Lokasi bukti pembayaran tidak cocok dengan bucket "${bucket}"`,
      code: "STORAGE_OBJECT_INVALID",
    });
    return;
  }

  try {
    const file = await downloadFromStorage(bucket, filePath);
    const safeFilename = (filePath.split("/").pop() ?? "bukti-bayar")
      .replace(/[^a-zA-Z0-9._-]/g, "_");
    res.setHeader("Content-Type", file.contentType);
    res.setHeader("Content-Disposition", `inline; filename="${safeFilename}"`);
    res.setHeader("Cache-Control", "private, max-age=300");
    res.send(file.buffer);
  } catch {
    res.status(502).json({
      error: `Bukti pembayaran gagal dimuat dari Supabase Storage bucket "${bucket}". Periksa bucket dan permission server.`,
      code: "STORAGE_DOWNLOAD_FAILED",
    });
  }
});

export default router;
