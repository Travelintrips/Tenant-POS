import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  tenantsTable, insertTenantSchema,
  tenantBookingsTable, tenantInvoicesTable, tenantPaymentsTable, mallSitesTable,
} from "@workspace/db/schema";
import { eq, asc, desc, and, inArray, sql } from "drizzle-orm";
import { requireAnyRole } from "../middlewares/auth";
import { logAudit } from "../lib/audit";

const router: IRouter = Router();

router.use("/tenants", requireAnyRole("owner", "admin"));

router.get("/tenants", async (req, res) => {
  try {
    const siteId = req.siteId;
    const conditions = siteId > 0 ? [eq(tenantsTable.siteId, siteId)] : [];
    const rows = await db
      .select()
      .from(tenantsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(tenantsTable.id));

    if (rows.length === 0) { res.json([]); return; }

    const tenantIds = rows.map((t) => t.id);
    const bookingDates = await db
      .select({
        tenantId: tenantBookingsTable.tenantId,
        contractEndDate: sql<string>`MAX(${tenantBookingsTable.endDate})`.as("contract_end_date"),
      })
      .from(tenantBookingsTable)
      .where(
        and(
          inArray(tenantBookingsTable.tenantId, tenantIds),
          inArray(tenantBookingsTable.contractStatus, ["active", "expiring_soon"]),
        ),
      )
      .groupBy(tenantBookingsTable.tenantId);

    const endDateMap = new Map(bookingDates.map((b) => [b.tenantId, b.contractEndDate]));

    res.json(rows.map((t) => ({ ...t, contractEndDate: endDateMap.get(t.id) ?? null })));
  } catch (err) {
    req.log.error(err, "Failed to list tenants");
    res.status(500).json({ error: "Gagal mengambil data tenant" });
  }
});

router.post("/tenants", async (req, res) => {
  const body = req.siteId > 0 ? { ...req.body, siteId: req.siteId } : req.body;
  const parsed = insertTenantSchema.safeParse(body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const [tenant] = await db
      .insert(tenantsTable)
      .values(parsed.data)
      .returning();
    logAudit(req, {
      action: "create_tenant",
      entityType: "tenant",
      entityId: tenant.id,
      afterData: tenant,
    });
    res.status(201).json(tenant);
  } catch (err) {
    req.log.error(err, "Failed to create tenant");
    res.status(500).json({ error: "Gagal membuat tenant" });
  }
});

router.get("/tenants/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "ID tidak valid" });
    return;
  }
  try {
    const [tenant] = await db
      .select()
      .from(tenantsTable)
      .where(eq(tenantsTable.id, id));
    if (!tenant) {
      res.status(404).json({ error: "Tenant tidak ditemukan" });
      return;
    }
    res.json(tenant);
  } catch (err) {
    req.log.error(err, "Failed to get tenant");
    res.status(500).json({ error: "Gagal mengambil tenant" });
  }
});

/**
 * GET /api/tenants/:id/profile
 * Detail lengkap satu tenant: info dasar, booking, invoice, pembayaran, KPI
 */
router.get("/tenants/:id/profile", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid" }); return; }

  try {
    // ── 1. Tenant + site name ─────────────────────────────────────────────────
    const rows = await db
      .select({
        tenant: tenantsTable,
        siteName: mallSitesTable.name,
        siteType: mallSitesTable.type,
      })
      .from(tenantsTable)
      .leftJoin(mallSitesTable, eq(tenantsTable.siteId, mallSitesTable.id))
      .where(eq(tenantsTable.id, id));

    if (!rows.length) { res.status(404).json({ error: "Tenant tidak ditemukan" }); return; }
    const { tenant, siteName, siteType } = rows[0];

    // ── 2. Bookings ───────────────────────────────────────────────────────────
    const bookings = await db
      .select()
      .from(tenantBookingsTable)
      .where(eq(tenantBookingsTable.tenantId, id))
      .orderBy(desc(tenantBookingsTable.startDate));

    // ── 3. Invoices ───────────────────────────────────────────────────────────
    const invoices = await db
      .select()
      .from(tenantInvoicesTable)
      .where(eq(tenantInvoicesTable.tenantId, id))
      .orderBy(desc(tenantInvoicesTable.periodStart));

    // ── 4. Payments ───────────────────────────────────────────────────────────
    const payments = await db
      .select()
      .from(tenantPaymentsTable)
      .where(and(
        eq(tenantPaymentsTable.tenantId, id),
        sql`(${tenantPaymentsTable.isVoided} = false OR ${tenantPaymentsTable.isVoided} IS NULL)`,
      ))
      .orderBy(desc(tenantPaymentsTable.paidAt));

    // ── 5. KPI ────────────────────────────────────────────────────────────────
    const totalBilled      = invoices.reduce((s, i) => s + Number(i.totalAmount  ?? 0), 0);
    const totalPaid        = invoices.reduce((s, i) => s + Number(i.paidAmount   ?? 0), 0);
    const totalOutstanding = invoices.reduce((s, i) => s + Number(i.outstandingAmount ?? 0), 0);
    const paymentRate      = totalBilled > 0 ? Math.round(totalPaid / totalBilled * 100) : 0;
    const overdueInvoices  = invoices.filter(i => i.status === "overdue").length;
    const activeBooking    = bookings.find(b => b.contractStatus === "active" || b.bookingStatus === "confirmed");

    res.json({
      tenant: { ...tenant, siteName, siteType },
      bookings,
      invoices,
      payments,
      kpi: { totalBilled, totalPaid, totalOutstanding, paymentRate, overdueInvoices, activeBooking: activeBooking ?? null },
    });
  } catch (err) {
    req.log.error(err, "Failed to get tenant profile");
    res.status(500).json({ error: "Gagal mengambil profil tenant" });
  }
});

router.put("/tenants/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "ID tidak valid" });
    return;
  }
  const parsed = insertTenantSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const [before] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, id));
    const [tenant] = await db
      .update(tenantsTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(tenantsTable.id, id))
      .returning();
    if (!tenant) {
      res.status(404).json({ error: "Tenant tidak ditemukan" });
      return;
    }
    logAudit(req, {
      action: "update_tenant",
      entityType: "tenant",
      entityId: id,
      beforeData: before,
      afterData: tenant,
    });
    res.json(tenant);
  } catch (err) {
    req.log.error(err, "Failed to update tenant");
    res.status(500).json({ error: "Gagal memperbarui tenant" });
  }
});

router.delete("/tenants/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "ID tidak valid" });
    return;
  }
  try {
    const [deleted] = await db
      .delete(tenantsTable)
      .where(eq(tenantsTable.id, id))
      .returning();
    if (!deleted) {
      res.status(404).json({ error: "Tenant tidak ditemukan" });
      return;
    }
    logAudit(req, {
      action: "delete_tenant",
      entityType: "tenant",
      entityId: id,
      beforeData: deleted,
    });
    res.json({ success: true, deleted });
  } catch (err) {
    req.log.error(err, "Failed to delete tenant");
    res.status(500).json({ error: "Gagal menghapus tenant" });
  }
});

export default router;
