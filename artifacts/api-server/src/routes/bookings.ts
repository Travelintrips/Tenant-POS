import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  tenantBookingsTable,
  tenantsTable,
  insertTenantBookingSchema,
} from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

const bookingSelect = {
  id: tenantBookingsTable.id,
  tenantId: tenantBookingsTable.tenantId,
  tenantName: tenantsTable.businessName,
  orderNumber: tenantBookingsTable.orderNumber,
  bookingType: tenantBookingsTable.bookingType,
  startDate: tenantBookingsTable.startDate,
  endDate: tenantBookingsTable.endDate,
  durationMonths: tenantBookingsTable.durationMonths,
  price: tenantBookingsTable.price,
  totalPrice: tenantBookingsTable.totalPrice,
  monthlyPrice: tenantBookingsTable.monthlyPrice,
  paymentStatus: tenantBookingsTable.paymentStatus,
  status: tenantBookingsTable.status,
  paymentPeriodType: tenantBookingsTable.paymentPeriodType,
  periodStartMonth: tenantBookingsTable.periodStartMonth,
  periodStartYear: tenantBookingsTable.periodStartYear,
  periodEndMonth: tenantBookingsTable.periodEndMonth,
  periodEndYear: tenantBookingsTable.periodEndYear,
  totalMonths: tenantBookingsTable.totalMonths,
  adminNotes: tenantBookingsTable.adminNotes,
  createdAt: tenantBookingsTable.createdAt,
  updatedAt: tenantBookingsTable.updatedAt,
} as const;

router.get("/bookings", async (req, res) => {
  try {
    const rows = await db
      .select(bookingSelect)
      .from(tenantBookingsTable)
      .leftJoin(tenantsTable, eq(tenantBookingsTable.tenantId, tenantsTable.id))
      .orderBy(tenantBookingsTable.id);
    res.json(rows);
  } catch (err) {
    req.log.error(err, "Failed to list bookings");
    res.status(500).json({ error: "Gagal mengambil data booking" });
  }
});

router.post("/bookings", async (req, res) => {
  const parsed = insertTenantBookingSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const [booking] = await db
      .insert(tenantBookingsTable)
      .values(parsed.data)
      .returning();

    const [withTenant] = await db
      .select(bookingSelect)
      .from(tenantBookingsTable)
      .leftJoin(tenantsTable, eq(tenantBookingsTable.tenantId, tenantsTable.id))
      .where(eq(tenantBookingsTable.id, booking.id));

    res.status(201).json(withTenant);
  } catch (err) {
    req.log.error(err, "Failed to create booking");
    res.status(500).json({ error: "Gagal membuat booking" });
  }
});

router.get("/bookings/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "ID tidak valid" });
    return;
  }
  try {
    const [row] = await db
      .select(bookingSelect)
      .from(tenantBookingsTable)
      .leftJoin(tenantsTable, eq(tenantBookingsTable.tenantId, tenantsTable.id))
      .where(eq(tenantBookingsTable.id, id));

    if (!row) {
      res.status(404).json({ error: "Booking tidak ditemukan" });
      return;
    }
    res.json(row);
  } catch (err) {
    req.log.error(err, "Failed to get booking");
    res.status(500).json({ error: "Gagal mengambil booking" });
  }
});

router.put("/bookings/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "ID tidak valid" });
    return;
  }
  const parsed = insertTenantBookingSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const [updated] = await db
      .update(tenantBookingsTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(tenantBookingsTable.id, id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Booking tidak ditemukan" });
      return;
    }

    const [withTenant] = await db
      .select(bookingSelect)
      .from(tenantBookingsTable)
      .leftJoin(tenantsTable, eq(tenantBookingsTable.tenantId, tenantsTable.id))
      .where(eq(tenantBookingsTable.id, id));

    res.json(withTenant);
  } catch (err) {
    req.log.error(err, "Failed to update booking");
    res.status(500).json({ error: "Gagal memperbarui booking" });
  }
});

export default router;
