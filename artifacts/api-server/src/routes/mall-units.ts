import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sseBroker } from "../lib/sse-broker";
import {
  mallUnitsTable,
  mallSitesTable,
  tenantBookingsTable,
  tenantInvoicesTable,
  tenantsTable,
  insertMallUnitSchema,
  UNIT_STATUSES,
  UNIT_TYPES,
  type UnitStatus,
} from "@workspace/db/schema";
import { eq, and, or, sql, desc, inArray } from "drizzle-orm";
import { requireAnyRole } from "../middlewares/auth";
import { logAudit } from "../lib/audit";

const router: IRouter = Router();

router.use("/mall-units", requireAnyRole("owner", "admin", "finance", "cashier"));

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

  if (storedStatus === "maintenance") return "maintenance";
  if (!hasBooking) return "available";

  const endDate = bookingEndDate ?? "";
  const dueDate = bookingDueDate ?? "";

  if (endDate && endDate < todayStr) return "expired";
  if (bookingContractStatus === "terminated" || bookingContractStatus === "expired") return "expired";

  const ps = (bookingPaymentStatus ?? "").toUpperCase();
  if (ps === "OVERDUE") return "overdue";
  if ((ps === "UNPAID" || ps === "PARTIAL") && dueDate && dueDate < todayStr) return "overdue";
  if (bookingContractStatus === "draft") return "booked";
  if (ps === "PAID" || ps === "PARTIAL") return "occupied";

  return "occupied";
}

// ─── GET /api/mall-units ──────────────────────────────────────────────────────
router.get("/mall-units", async (req, res) => {
  try {
    const siteId = req.siteId;
    const unitSiteFilter = siteId > 0 ? eq(mallUnitsTable.siteId, siteId) : undefined;
    const units = await db.select().from(mallUnitsTable)
      .where(unitSiteFilter)
      .orderBy(mallUnitsTable.positionY, mallUnitsTable.positionX);

    const todayStr = today();

    const bookingConditions: any[] = [
      sql`${tenantBookingsTable.contractStatus} NOT IN ('terminated')`,
      sql`${tenantBookingsTable.endDate} >= ${todayStr} OR ${tenantBookingsTable.endDate} IS NULL`,
    ];
    if (siteId > 0) bookingConditions.push(eq(tenantBookingsTable.siteId, siteId));

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

    const tenantSiteFilter = siteId > 0 ? eq(tenantsTable.siteId, siteId) : undefined;
    const tenants = await db.select().from(tenantsTable).where(tenantSiteFilter);

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

    const bookingByUnit = new Map<string, typeof bookings[number]>();
    for (const b of bookings) {
      if (!b.unitCode) continue;
      const existing = bookingByUnit.get(b.unitCode);
      if (!existing) {
        bookingByUnit.set(b.unitCode, b);
      } else {
        const existingActive = existing.contractStatus === "active" || existing.contractStatus === "expiring_soon";
        const newActive = b.contractStatus === "active" || b.contractStatus === "expiring_soon";
        if (!existingActive && newActive) bookingByUnit.set(b.unitCode, b);
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
        siteId: u.siteId,
        unitCode: u.unitCode,
        floor: u.floor,
        zone: u.zone,
        areaKantin: u.areaKantin,
        unitType: u.unitType,
        sizeM2: u.sizeM2,
        defaultRentAmount: u.defaultRentAmount,
        storedStatus: u.status,
        status: computedStatus,
        positionX: u.positionX,
        positionY: u.positionY,
        width: u.width,
        height: u.height,
        notes: u.notes,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
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
    res.status(500).json({ error: "Gagal mengambil data unit" });
  }
});

// ─── GET /api/mall-units/areas ────────────────────────────────────────────────
router.get("/mall-units/areas", async (req, res) => {
  try {
    const siteFilter = req.siteId > 0 ? eq(mallUnitsTable.siteId, req.siteId) : undefined;
    const rows = await db
      .selectDistinct({ area: mallUnitsTable.areaKantin })
      .from(mallUnitsTable)
      .where(siteFilter);
    res.json(rows.map(r => r.area).filter(Boolean));
  } catch (err) {
    res.status(500).json({ error: "Gagal mengambil daftar area" });
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

// ─── GET /api/mall-units/:id ──────────────────────────────────────────────────
router.get("/mall-units/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid" }); return; }
  try {
    const [unit] = await db.select().from(mallUnitsTable).where(eq(mallUnitsTable.id, id));
    if (!unit) { res.status(404).json({ error: "Unit tidak ditemukan" }); return; }
    res.json(unit);
  } catch (err) {
    res.status(500).json({ error: "Gagal mengambil unit" });
  }
});

// ─── POST /api/mall-units ─────────────────────────────────────────────────────
router.post("/mall-units", requireAnyRole("owner", "admin"), async (req, res) => {
  const siteId = req.siteId > 0 ? req.siteId : req.body.siteId;

  if (req.body.unitCode && siteId) {
    const [existing] = await db
      .select({ id: mallUnitsTable.id })
      .from(mallUnitsTable)
      .where(and(
        eq(mallUnitsTable.unitCode, String(req.body.unitCode)),
        eq(mallUnitsTable.siteId, Number(siteId)),
      ));
    if (existing) {
      res.status(409).json({ error: `Kode unit '${req.body.unitCode}' sudah digunakan di lokasi ini` });
      return;
    }
  }

  const bodyWithDefaults = {
    floor: "Main",
    ...req.body,
    siteId,
    unitType: req.body.unitType ?? "other",
  };
  const parsed = insertMallUnitSchema.safeParse(bodyWithDefaults);
  if (!parsed.success) {
    res.status(400).json({ error: "Data tidak valid", detail: parsed.error.flatten().fieldErrors });
    return;
  }

  try {
    const [unit] = await db.insert(mallUnitsTable).values(parsed.data).returning();
    logAudit(req, {
      action: "create_unit",
      entityType: "mall_unit",
      entityId: unit.id,
      afterData: unit,
    });
    res.status(201).json(unit);
  } catch (err: any) {
    if (err?.cause?.code === "23505" || err?.code === "23505") {
      res.status(409).json({ error: `Kode unit '${req.body.unitCode}' sudah digunakan di lokasi ini` });
      return;
    }
    req.log.error(err, "Failed to create mall unit");
    res.status(500).json({ error: "Gagal membuat unit" });
  }
});

// ─── PATCH /api/mall-units/:id ────────────────────────────────────────────────
router.patch("/mall-units/:id", requireAnyRole("owner", "admin"), async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid" }); return; }

  const parsed = insertMallUnitSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Data tidak valid", detail: parsed.error.flatten().fieldErrors });
    return;
  }

  try {
    const [before] = await db.select().from(mallUnitsTable).where(eq(mallUnitsTable.id, id));
    if (!before) { res.status(404).json({ error: "Unit tidak ditemukan" }); return; }

    const isStatusOnly = Object.keys(req.body).length === 1 && "status" in req.body;
    const auditAction = isStatusOnly ? "update_unit_status" : "update_unit";

    const { siteId: _omit, ...safeUpdate } = parsed.data as any;
    const [updated] = await db
      .update(mallUnitsTable)
      .set({ ...safeUpdate, updatedAt: new Date() })
      .where(eq(mallUnitsTable.id, id))
      .returning();

    if (!updated) { res.status(404).json({ error: "Unit tidak ditemukan" }); return; }

    logAudit(req, {
      action: auditAction,
      entityType: "mall_unit",
      entityId: id,
      beforeData: before,
      afterData: updated,
    });
    sseBroker.publish("unit_updated", { unitId: id });
    res.json(updated);
  } catch (err: any) {
    if (err?.cause?.code === "23505" || err?.code === "23505") {
      res.status(409).json({ error: "Kode unit sudah digunakan di lokasi ini" });
      return;
    }
    req.log.error(err, "Failed to update mall unit");
    res.status(500).json({ error: "Gagal memperbarui unit" });
  }
});

// ─── DELETE /api/mall-units/:id ───────────────────────────────────────────────
router.delete("/mall-units/:id", requireAnyRole("owner", "admin"), async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid" }); return; }

  try {
    const [unit] = await db.select().from(mallUnitsTable).where(eq(mallUnitsTable.id, id));
    if (!unit) { res.status(404).json({ error: "Unit tidak ditemukan" }); return; }

    const activeBookings = await db
      .select({ id: tenantBookingsTable.id })
      .from(tenantBookingsTable)
      .where(and(
        eq(tenantBookingsTable.unitCode, unit.unitCode),
        inArray(tenantBookingsTable.contractStatus, ["active", "expiring_soon", "draft"]),
      ));

    if (activeBookings.length > 0) {
      res.status(409).json({
        error: "Unit tidak dapat dihapus karena masih memiliki booking aktif. Ubah status menjadi maintenance terlebih dahulu.",
      });
      return;
    }

    const [deleted] = await db
      .delete(mallUnitsTable)
      .where(eq(mallUnitsTable.id, id))
      .returning();

    logAudit(req, {
      action: "delete_unit",
      entityType: "mall_unit",
      entityId: id,
      beforeData: deleted,
    });
    res.json({ ok: true, deleted });
  } catch (err) {
    req.log.error(err, "Failed to delete mall unit");
    res.status(500).json({ error: "Gagal menghapus unit" });
  }
});

// ─── POST /api/mall-units/seed-kantin (dev only) ──────────────────────────────
if (process.env.NODE_ENV !== "production") {
  router.post("/mall-units/seed-kantin", requireAnyRole("owner", "admin"), async (req, res) => {
    try {
      const sites = await db
        .select({ id: mallSitesTable.id, code: mallSitesTable.code })
        .from(mallSitesTable)
        .where(inArray(mallSitesTable.code, ["KANTIN_SPORT_CENTER", "KANTIN_TOD_M1"]));

      const scSite = sites.find(s => s.code === "KANTIN_SPORT_CENTER");
      const todSite = sites.find(s => s.code === "KANTIN_TOD_M1");

      let inserted = 0;

      if (scSite) {
        const existing = await db.select({ id: mallUnitsTable.id }).from(mallUnitsTable)
          .where(eq(mallUnitsTable.siteId, scSite.id)).limit(1);
        if (existing.length === 0) {
          const scUnits = [
            { unitCode: "SC-KTN-01", unitType: "food_booth",      areaKantin: "Area Kantin",   floor: "Main", sizeM2: "12", positionX: 0, positionY: 0, width: 3, height: 2, status: "available", siteId: scSite.id },
            { unitCode: "SC-KTN-02", unitType: "beverage_booth",  areaKantin: "Area Kantin",   floor: "Main", sizeM2: "10", positionX: 3, positionY: 0, width: 3, height: 2, status: "available", siteId: scSite.id },
            { unitCode: "SC-KTN-03", unitType: "storage",         areaKantin: "Area Belakang", floor: "Main", sizeM2: "8",  positionX: 6, positionY: 0, width: 2, height: 2, status: "available", siteId: scSite.id },
          ];
          const rows = await db.insert(mallUnitsTable).values(scUnits).returning();
          inserted += rows.length;
        }
      }

      if (todSite) {
        const existing = await db.select({ id: mallUnitsTable.id }).from(mallUnitsTable)
          .where(eq(mallUnitsTable.siteId, todSite.id)).limit(1);
        if (existing.length === 0) {
          const todUnits = [
            { unitCode: "TOD-KTN-01", unitType: "food_booth",     areaKantin: "Area Kantin",   floor: "Main", sizeM2: "12", positionX: 0, positionY: 0, width: 3, height: 2, status: "available", siteId: todSite.id },
            { unitCode: "TOD-KTN-02", unitType: "beverage_booth", areaKantin: "Area Kantin",   floor: "Main", sizeM2: "10", positionX: 3, positionY: 0, width: 3, height: 2, status: "available", siteId: todSite.id },
            { unitCode: "TOD-KTN-03", unitType: "storage",        areaKantin: "Area Belakang", floor: "Main", sizeM2: "8",  positionX: 6, positionY: 0, width: 2, height: 2, status: "available", siteId: todSite.id },
          ];
          const rows = await db.insert(mallUnitsTable).values(todUnits).returning();
          inserted += rows.length;
        }
      }

      res.json({ ok: true, message: `${inserted} unit kantin berhasil diseed`, count: inserted });
    } catch (err) {
      req.log.error(err, "Failed to seed kantin units");
      res.status(500).json({ error: "Gagal seed data unit kantin" });
    }
  });

  router.post("/mall-units/seed", requireAnyRole("owner", "admin"), async (req, res) => {
    try {
      const existing = await db.select({ id: mallUnitsTable.id }).from(mallUnitsTable).limit(1);
      if (existing.length > 0) {
        res.json({ ok: true, message: "Data unit sudah ada, seed dilewati", count: 0 });
        return;
      }
      const siteId = req.siteId;
      const seedData = [
        { unitCode: "A-01", floor: "1", zone: "Food & Beverage", sizeM2: "24", positionX: 0, positionY: 0, width: 3, height: 2, status: "available" },
        { unitCode: "A-02", floor: "1", zone: "Food & Beverage", sizeM2: "18", positionX: 3, positionY: 0, width: 2, height: 2, status: "available" },
        { unitCode: "A-03", floor: "1", zone: "Food & Beverage", sizeM2: "30", positionX: 5, positionY: 0, width: 3, height: 2, status: "available" },
        { unitCode: "B-01", floor: "1", zone: "Retail", sizeM2: "45", positionX: 9, positionY: 0, width: 3, height: 2, status: "available" },
        { unitCode: "B-02", floor: "1", zone: "Retail", sizeM2: "30", positionX: 12, positionY: 0, width: 2, height: 2, status: "available" },
        { unitCode: "C-01", floor: "2", zone: "Fashion", sizeM2: "60", positionX: 0, positionY: 0, width: 4, height: 3, status: "available" },
        { unitCode: "D-01", floor: "2", zone: "Electronics", sizeM2: "80", positionX: 10, positionY: 0, width: 5, height: 3, status: "available" },
        { unitCode: "E-01", floor: "2", zone: "Entertainment", sizeM2: "120", positionX: 0, positionY: 5, width: 8, height: 4, status: "available" },
      ];
      const seedWithSite = siteId > 0 ? seedData.map(d => ({ ...d, siteId })) : seedData;
      const inserted = await db.insert(mallUnitsTable).values(seedWithSite).returning();
      res.json({ ok: true, message: `${inserted.length} unit berhasil diseed`, count: inserted.length });
    } catch (err) {
      req.log.error(err, "Failed to seed mall units");
      res.status(500).json({ error: "Gagal seed data unit" });
    }
  });
}

export default router;
