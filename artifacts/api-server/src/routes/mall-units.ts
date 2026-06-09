import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sseBroker } from "../lib/sse-broker";
import {
  mallUnitsTable,
  tenantBookingsTable,
  tenantInvoicesTable,
  tenantsTable,
  insertMallUnitSchema,
  UNIT_STATUSES,
  type UnitStatus,
} from "@workspace/db/schema";
import { eq, and, or, lte, gte, ne, sql, desc } from "drizzle-orm";
import { requireAnyRole } from "../middlewares/auth";
import { logAudit } from "../lib/audit";
import { z } from "zod";

const router: IRouter = Router();

router.use("/mall-units", requireAnyRole("owner", "admin", "finance", "cashier"));

// ─── Computed Status Logic ────────────────────────────────────────────────────

const today = () => new Date().toISOString().slice(0, 10);

function computeUnitStatus(opts: {
  storedStatus: string;
  bookingContractStatus: string | null;
  bookingPaymentStatus: string | null;
  bookingStartDate: string | null;
  bookingEndDate: string | null;
  bookingDueDate: string | null;
  hasBooking: boolean;
}): UnitStatus {
  const { storedStatus, hasBooking, bookingContractStatus, bookingPaymentStatus, bookingEndDate, bookingDueDate } = opts;
  const todayStr = today();

  // Manual override always wins
  if (storedStatus === "maintenance") return "maintenance";

  if (!hasBooking) return "available";

  const endDate = bookingEndDate ?? "";
  const dueDate = bookingDueDate ?? "";

  // Contract already expired (end_date in the past)
  if (endDate && endDate < todayStr) return "expired";

  // Contract terminated
  if (bookingContractStatus === "terminated" || bookingContractStatus === "expired") return "expired";

  // Check payment status
  const ps = (bookingPaymentStatus ?? "").toUpperCase();
  if (ps === "OVERDUE") return "overdue";
  if ((ps === "UNPAID" || ps === "PARTIAL") && dueDate && dueDate < todayStr) return "overdue";

  // Draft / not yet started = booked
  if (bookingContractStatus === "draft") return "booked";

  // Active with payment
  if (ps === "PAID") return "occupied";
  if (ps === "PARTIAL") return "occupied";

  // Active unpaid but not yet overdue = occupied (tenant is in)
  return "occupied";
}

// ─── GET /api/mall-units ──────────────────────────────────────────────────────
router.get("/mall-units", async (req, res) => {
  try {
    const siteId = req.siteId;
    const unitSiteFilter = siteId > 0 ? eq(mallUnitsTable.siteId, siteId) : undefined;
    const units = await db.select().from(mallUnitsTable)
      .where(unitSiteFilter)
      .orderBy(mallUnitsTable.floor, mallUnitsTable.positionY, mallUnitsTable.positionX);

    const todayStr = today();

    // Get all relevant bookings (filtered by site)
    const bookingConditions: ReturnType<typeof eq>[] = [
      sql`${tenantBookingsTable.contractStatus} NOT IN ('terminated')` as any,
      sql`${tenantBookingsTable.endDate} >= ${todayStr} OR ${tenantBookingsTable.endDate} IS NULL` as any,
    ];
    if (siteId > 0) bookingConditions.push(eq(tenantBookingsTable.siteId, siteId) as any);

    const bookings = await db
      .select({
        id: tenantBookingsTable.id,
        unitCode: tenantBookingsTable.unitCode,
        tenantId: tenantBookingsTable.tenantId,
        contractStatus: tenantBookingsTable.contractStatus,
        paymentStatus: tenantBookingsTable.paymentStatus,
        startDate: tenantBookingsTable.startDate,
        endDate: tenantBookingsTable.endDate,
        dueDate: tenantBookingsTable.dueDate,
        periodLabel: tenantBookingsTable.periodLabel,
        totalAmount: tenantBookingsTable.totalAmount,
        paidAmount: tenantBookingsTable.paidAmount,
        remainingAmount: tenantBookingsTable.remainingAmount,
      })
      .from(tenantBookingsTable)
      .where(and(...bookingConditions));

    // Get tenants (filtered by site)
    const tenantSiteFilter = siteId > 0 ? eq(tenantsTable.siteId, siteId) : undefined;
    const tenants = await db.select().from(tenantsTable).where(tenantSiteFilter);

    // Get latest invoices per booking (filtered by site)
    const invoiceSiteFilter = siteId > 0 ? eq(tenantInvoicesTable.siteId, siteId) : undefined;
    const invoices = await db
      .select({
        bookingId: tenantInvoicesTable.bookingId,
        id: tenantInvoicesTable.id,
        status: tenantInvoicesTable.status,
        totalAmount: tenantInvoicesTable.totalAmount,
        outstandingAmount: tenantInvoicesTable.outstandingAmount,
        dueDate: tenantInvoicesTable.dueDate,
      })
      .from(tenantInvoicesTable)
      .where(invoiceSiteFilter)
      .orderBy(desc(tenantInvoicesTable.createdAt));

    // Build maps
    const bookingByUnit = new Map<string, typeof bookings[number]>();
    for (const b of bookings) {
      if (!b.unitCode) continue;
      const existing = bookingByUnit.get(b.unitCode);
      if (!existing) {
        bookingByUnit.set(b.unitCode, b);
      } else {
        // Prefer active over draft, most recent endDate
        const existingActive = existing.contractStatus === "active" || existing.contractStatus === "expiring_soon";
        const newActive = b.contractStatus === "active" || b.contractStatus === "expiring_soon";
        if (!existingActive && newActive) {
          bookingByUnit.set(b.unitCode, b);
        }
      }
    }

    const tenantMap = new Map(tenants.map(t => [t.id, t]));

    const latestInvoiceByBooking = new Map<number, typeof invoices[number]>();
    for (const inv of invoices) {
      if (inv.bookingId && !latestInvoiceByBooking.has(inv.bookingId)) {
        latestInvoiceByBooking.set(inv.bookingId, inv);
      }
    }

    const result = units.map((u) => {
      const booking = bookingByUnit.get(u.unitCode) ?? null;
      const tenant = booking?.tenantId ? tenantMap.get(booking.tenantId) : null;
      const invoice = booking?.id ? latestInvoiceByBooking.get(booking.id) : null;

      const computedStatus = computeUnitStatus({
        storedStatus: u.status,
        hasBooking: !!booking,
        bookingContractStatus: booking?.contractStatus ?? null,
        bookingPaymentStatus: booking?.paymentStatus ?? null,
        bookingStartDate: booking?.startDate ?? null,
        bookingEndDate: booking?.endDate ?? null,
        bookingDueDate: booking?.dueDate ?? null,
      });

      return {
        id: u.id,
        unitCode: u.unitCode,
        floor: u.floor,
        zone: u.zone,
        sizeM2: u.sizeM2,
        storedStatus: u.status,
        status: computedStatus,
        positionX: u.positionX,
        positionY: u.positionY,
        width: u.width,
        height: u.height,
        notes: u.notes,
        // Booking info
        bookingId: booking?.id ?? null,
        tenantId: booking?.tenantId ?? null,
        businessName: tenant?.businessName ?? null,
        ownerName: tenant?.ownerName ?? null,
        phone: tenant?.phone ?? null,
        email: tenant?.email ?? null,
        category: tenant?.category ?? tenant?.businessCategory ?? null,
        boothNumber: tenant?.boothNumber ?? u.unitCode,
        startDate: booking?.startDate ?? null,
        endDate: booking?.endDate ?? null,
        totalAmount: Number(booking?.totalAmount ?? 0),
        paidAmount: Number(booking?.paidAmount ?? 0),
        remainingAmount: Number(booking?.remainingAmount ?? 0),
        paymentStatus: booking?.paymentStatus ?? null,
        periodLabel: booking?.periodLabel ?? null,
        dueDate: booking?.dueDate ?? null,
        // Invoice info
        latestInvoiceId: invoice?.id ?? null,
        latestInvoiceStatus: invoice?.status ?? null,
        latestInvoiceAmount: invoice?.totalAmount ? Number(invoice.totalAmount) : null,
        latestInvoiceDueDate: invoice?.dueDate ?? null,
        latestInvoiceOutstanding: invoice?.outstandingAmount ? Number(invoice.outstandingAmount) : null,
      };
    });

    res.json(result);
  } catch (err) {
    req.log.error(err, "Failed to get mall units");
    res.status(500).json({ error: "Gagal mengambil data unit mall" });
  }
});

// ─── GET /api/mall-units/floors ───────────────────────────────────────────────
router.get("/mall-units/floors", async (req, res) => {
  try {
    const siteFilter = req.siteId > 0 ? eq(mallUnitsTable.siteId, req.siteId) : undefined;
    const rows = await db
      .selectDistinct({ floor: mallUnitsTable.floor })
      .from(mallUnitsTable)
      .where(siteFilter)
      .orderBy(mallUnitsTable.floor);
    res.json(rows.map(r => r.floor));
  } catch (err) {
    res.status(500).json({ error: "Gagal mengambil daftar lantai" });
  }
});

// ─── POST /api/mall-units ─────────────────────────────────────────────────────
router.post("/mall-units", requireAnyRole("owner", "admin"), async (req, res) => {
  // Check for unitCode uniqueness
  if (req.body.unitCode) {
    const [existing] = await db
      .select({ id: mallUnitsTable.id })
      .from(mallUnitsTable)
      .where(eq(mallUnitsTable.unitCode, String(req.body.unitCode)));
    if (existing) {
      res.status(409).json({ error: `Unit code '${req.body.unitCode}' sudah digunakan` });
      return;
    }
  }

  const parsed = insertMallUnitSchema.safeParse({ ...req.body, siteId: req.siteId > 0 ? req.siteId : req.body.siteId });
  const bodyWithSite = { ...req.body, siteId: req.siteId > 0 ? req.siteId : req.body.siteId };
  const parsed = insertMallUnitSchema.safeParse(bodyWithSite);
  if (!parsed.success) {
    res.status(400).json({ error: "Data tidak valid", detail: parsed.error.flatten().fieldErrors });
    return;
  }

  try {
    const [unit] = await db.insert(mallUnitsTable).values(parsed.data).returning();
    logAudit(req, {
      action: "update_unit_status",
      entityType: "mall_unit",
      entityId: unit.id,
      afterData: unit,
    });
    res.status(201).json(unit);
  } catch (err) {
    req.log.error(err, "Failed to create mall unit");
    res.status(500).json({ error: "Gagal membuat unit" });
  }
});

// ─── PATCH /api/mall-units/:id ────────────────────────────────────────────────
router.patch("/mall-units/:id", requireAnyRole("owner", "admin"), async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "ID tidak valid" });
    return;
  }

  const parsed = insertMallUnitSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Data tidak valid", detail: parsed.error.flatten().fieldErrors });
    return;
  }

  try {
    const [before] = await db.select().from(mallUnitsTable).where(eq(mallUnitsTable.id, id));
    const [updated] = await db
      .update(mallUnitsTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(mallUnitsTable.id, id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Unit tidak ditemukan" });
      return;
    }
    logAudit(req, {
      action: "update_unit_status",
      entityType: "mall_unit",
      entityId: id,
      beforeData: before,
      afterData: updated,
    });
    sseBroker.publish("unit_updated", { unitId: id });
    res.json(updated);
  } catch (err) {
    req.log.error(err, "Failed to update mall unit");
    res.status(500).json({ error: "Gagal memperbarui unit" });
  }
});

// ─── DELETE /api/mall-units/:id ──────────────────────────────────────────────
router.delete("/mall-units/:id", requireAnyRole("owner", "admin"), async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "ID tidak valid" });
    return;
  }
  try {
    const [deleted] = await db
      .delete(mallUnitsTable)
      .where(eq(mallUnitsTable.id, id))
      .returning();
    if (!deleted) {
      res.status(404).json({ error: "Unit tidak ditemukan" });
      return;
    }
    res.json({ ok: true, deleted });
  } catch (err) {
    req.log.error(err, "Failed to delete mall unit");
    res.status(500).json({ error: "Gagal menghapus unit" });
  }
});

// ─── POST /api/mall-units/seed (dev only) ────────────────────────────────────
if (process.env.NODE_ENV !== "production") {
  router.post("/mall-units/seed", requireAnyRole("owner", "admin"), async (req, res) => {
    try {
      const existing = await db.select({ id: mallUnitsTable.id }).from(mallUnitsTable).limit(1);
      if (existing.length > 0) {
        res.json({ ok: true, message: "Data unit sudah ada, seed dilewati", count: 0 });
        return;
      }

      const seedData = [
        // ── Lantai 1 – Zone A: Food & Beverage (kiri) ─────────────────────
        { unitCode: "A-01", floor: "1", zone: "Food & Beverage", sizeM2: "24", positionX: 0, positionY: 0, width: 3, height: 2, status: "available" },
        { unitCode: "A-02", floor: "1", zone: "Food & Beverage", sizeM2: "18", positionX: 3, positionY: 0, width: 2, height: 2, status: "available" },
        { unitCode: "A-03", floor: "1", zone: "Food & Beverage", sizeM2: "30", positionX: 5, positionY: 0, width: 3, height: 2, status: "available" },
        { unitCode: "A-04", floor: "1", zone: "Food & Beverage", sizeM2: "20", positionX: 0, positionY: 2, width: 2, height: 2, status: "available" },
        { unitCode: "A-05", floor: "1", zone: "Food & Beverage", sizeM2: "36", positionX: 2, positionY: 2, width: 4, height: 2, status: "available" },
        { unitCode: "A-06", floor: "1", zone: "Food & Beverage", sizeM2: "16", positionX: 6, positionY: 2, width: 2, height: 2, status: "maintenance", notes: "Renovasi atap" },
        // ── Lantai 1 – Zone B: Retail (kanan) ─────────────────────────────
        { unitCode: "B-01", floor: "1", zone: "Retail", sizeM2: "45", positionX: 9, positionY: 0, width: 3, height: 2, status: "available" },
        { unitCode: "B-02", floor: "1", zone: "Retail", sizeM2: "30", positionX: 12, positionY: 0, width: 2, height: 2, status: "available" },
        { unitCode: "B-03", floor: "1", zone: "Retail", sizeM2: "28", positionX: 14, positionY: 0, width: 2, height: 2, status: "available" },
        { unitCode: "B-04", floor: "1", zone: "Retail", sizeM2: "50", positionX: 9, positionY: 2, width: 3, height: 2, status: "available" },
        { unitCode: "B-05", floor: "1", zone: "Retail", sizeM2: "40", positionX: 12, positionY: 2, width: 2, height: 2, status: "available" },
        { unitCode: "B-06", floor: "1", zone: "Retail", sizeM2: "35", positionX: 14, positionY: 2, width: 2, height: 2, status: "available" },
        // ── Lantai 2 – Zone C: Fashion ─────────────────────────────────────
        { unitCode: "C-01", floor: "2", zone: "Fashion", sizeM2: "60", positionX: 0, positionY: 0, width: 4, height: 3, status: "available" },
        { unitCode: "C-02", floor: "2", zone: "Fashion", sizeM2: "40", positionX: 4, positionY: 0, width: 3, height: 2, status: "available" },
        { unitCode: "C-03", floor: "2", zone: "Fashion", sizeM2: "35", positionX: 7, positionY: 0, width: 2, height: 2, status: "available" },
        { unitCode: "C-04", floor: "2", zone: "Fashion", sizeM2: "28", positionX: 4, positionY: 2, width: 2, height: 2, status: "available" },
        { unitCode: "C-05", floor: "2", zone: "Fashion", sizeM2: "28", positionX: 6, positionY: 2, width: 3, height: 2, status: "maintenance", notes: "AC rusak" },
        // ── Lantai 2 – Zone D: Electronics ────────────────────────────────
        { unitCode: "D-01", floor: "2", zone: "Electronics", sizeM2: "80", positionX: 10, positionY: 0, width: 5, height: 3, status: "available" },
        { unitCode: "D-02", floor: "2", zone: "Electronics", sizeM2: "45", positionX: 15, positionY: 0, width: 3, height: 3, status: "available" },
        { unitCode: "D-03", floor: "2", zone: "Electronics", sizeM2: "30", positionX: 10, positionY: 3, width: 4, height: 2, status: "available" },
        { unitCode: "D-04", floor: "2", zone: "Electronics", sizeM2: "25", positionX: 14, positionY: 3, width: 4, height: 2, status: "available" },
        // ── Lantai 2 – Zone E: Entertainment ──────────────────────────────
        { unitCode: "E-01", floor: "2", zone: "Entertainment", sizeM2: "120", positionX: 0, positionY: 5, width: 8, height: 4, status: "available" },
        { unitCode: "E-02", floor: "2", zone: "Entertainment", sizeM2: "80", positionX: 10, positionY: 5, width: 8, height: 4, status: "available" },
      ];

      const siteId = req.siteId;
      const seedWithSite = siteId > 0
        ? seedData.map((d) => ({ ...d, siteId }))
        : seedData;
      const inserted = await db.insert(mallUnitsTable).values(seedWithSite).returning();
      res.json({ ok: true, message: `${inserted.length} unit berhasil diseed`, count: inserted.length });
    } catch (err) {
      req.log.error(err, "Failed to seed mall units");
      res.status(500).json({ error: "Gagal seed data unit" });
    }
  });
}

export default router;
