import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  tenantBookingsTable,
  tenantsTable,
  insertTenantBookingSchema,
} from "@workspace/db/schema";
import { eq, and, ne, lt, lte, gte, or } from "drizzle-orm";
import { requireAnyRole } from "../middlewares/auth";
import { z } from "zod/v4";

const router: IRouter = Router();

router.use(requireAnyRole("owner", "admin", "finance"));

const NUMERIC_FIELDS = [
  "rentAmount","depositAmount","serviceChargeAmount","electricityChargeAmount",
  "waterChargeAmount","totalAmount","paidAmount","remainingAmount","price",
  "monthlyPrice","yearlyPrice","totalPrice",
];

function coerceNumericFields(body: Record<string, unknown>): Record<string, unknown> {
  const out = { ...body };
  for (const field of NUMERIC_FIELDS) {
    if (field in out && out[field] !== null && out[field] !== undefined && out[field] !== "") {
      out[field] = String(out[field]);
    }
  }
  return out;
}

const bookingSelect = {
  id: tenantBookingsTable.id,
  tenantId: tenantBookingsTable.tenantId,
  tenantName: tenantsTable.businessName,
  boothNumber: tenantsTable.boothNumber,
  areaName: tenantsTable.areaName,
  orderNumber: tenantBookingsTable.orderNumber,
  contractNumber: tenantBookingsTable.contractNumber,
  bookingType: tenantBookingsTable.bookingType,
  unitCode: tenantBookingsTable.unitCode,
  floor: tenantBookingsTable.floor,
  startDate: tenantBookingsTable.startDate,
  endDate: tenantBookingsTable.endDate,
  durationMonths: tenantBookingsTable.durationMonths,
  billingCycle: tenantBookingsTable.billingCycle,
  rentAmount: tenantBookingsTable.rentAmount,
  depositAmount: tenantBookingsTable.depositAmount,
  serviceChargeAmount: tenantBookingsTable.serviceChargeAmount,
  electricityChargeAmount: tenantBookingsTable.electricityChargeAmount,
  waterChargeAmount: tenantBookingsTable.waterChargeAmount,
  price: tenantBookingsTable.price,
  totalPrice: tenantBookingsTable.totalPrice,
  monthlyPrice: tenantBookingsTable.monthlyPrice,
  totalAmount: tenantBookingsTable.totalAmount,
  paidAmount: tenantBookingsTable.paidAmount,
  remainingAmount: tenantBookingsTable.remainingAmount,
  paymentStatus: tenantBookingsTable.paymentStatus,
  contractStatus: tenantBookingsTable.contractStatus,
  status: tenantBookingsTable.status,
  bookingStatus: tenantBookingsTable.bookingStatus,
  dueDate: tenantBookingsTable.dueDate,
  periodLabel: tenantBookingsTable.periodLabel,
  paymentPeriodType: tenantBookingsTable.paymentPeriodType,
  periodStartMonth: tenantBookingsTable.periodStartMonth,
  periodStartYear: tenantBookingsTable.periodStartYear,
  periodEndMonth: tenantBookingsTable.periodEndMonth,
  periodEndYear: tenantBookingsTable.periodEndYear,
  totalMonths: tenantBookingsTable.totalMonths,
  adminNotes: tenantBookingsTable.adminNotes,
  notes: tenantBookingsTable.notes,
  documentUrl: tenantBookingsTable.documentUrl,
  createdAt: tenantBookingsTable.createdAt,
  updatedAt: tenantBookingsTable.updatedAt,
} as const;

function computeContractStatus(row: {
  contractStatus: string | null;
  startDate: string | null;
  endDate: string | null;
}): string {
  const stored = row.contractStatus ?? "draft";
  if (stored === "terminated") return "terminated";
  if (!row.endDate) return stored;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(row.endDate);
  end.setHours(0, 0, 0, 0);

  if (end < today) return "expired";

  const daysUntilEnd = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (stored === "active" && daysUntilEnd <= 30) return "expiring_soon";

  return stored;
}

const contractValidationSchema = z.object({
  tenantId: z.number().int().positive({ message: "Tenant wajib dipilih" }),
  startDate: z.string().min(1, { message: "Tanggal mulai wajib diisi" }),
  endDate: z.string().min(1, { message: "Tanggal selesai wajib diisi" }),
  rentAmount: z.union([z.string(), z.number()]).optional().nullable(),
}).passthrough().superRefine((val, ctx) => {
  if (val.startDate && val.endDate && val.endDate <= val.startDate) {
    ctx.addIssue({ code: "custom", message: "Tanggal selesai tidak boleh sebelum tanggal mulai", path: ["endDate"] });
  }
  if (val.rentAmount !== undefined && val.rentAmount !== null && val.rentAmount !== "") {
    const num = Number(val.rentAmount);
    if (!isNaN(num) && num < 0) {
      ctx.addIssue({ code: "custom", message: "Harga sewa tidak boleh minus", path: ["rentAmount"] });
    }
  }
});

async function checkUnitOverlap(
  unitCode: string,
  startDate: string,
  endDate: string,
  excludeId?: number,
): Promise<boolean> {
  const conditions = [
    eq(tenantBookingsTable.unitCode, unitCode),
    lt(tenantBookingsTable.startDate, endDate),
    gte(tenantBookingsTable.endDate, startDate),
  ];

  const statusFilter = or(
    eq(tenantBookingsTable.contractStatus, "active"),
    eq(tenantBookingsTable.contractStatus, "draft"),
    eq(tenantBookingsTable.contractStatus, "expiring_soon"),
  );
  conditions.push(statusFilter!);

  if (excludeId !== undefined) {
    conditions.push(ne(tenantBookingsTable.id, excludeId));
  }

  const existing = await db
    .select({ id: tenantBookingsTable.id })
    .from(tenantBookingsTable)
    .where(and(...conditions))
    .limit(1);

  return existing.length > 0;
}

router.get("/bookings", async (req, res) => {
  try {
    const rows = await db
      .select(bookingSelect)
      .from(tenantBookingsTable)
      .leftJoin(tenantsTable, eq(tenantBookingsTable.tenantId, tenantsTable.id))
      .orderBy(tenantBookingsTable.id);

    const enriched = rows.map((r) => ({
      ...r,
      contractStatus: computeContractStatus(r),
    }));

    res.json(enriched);
  } catch (err) {
    req.log.error(err, "Failed to list bookings");
    res.status(500).json({ error: "Gagal mengambil data booking" });
  }
});

router.post("/bookings", async (req, res) => {
  const extraValidation = contractValidationSchema.safeParse(req.body);
  if (!extraValidation.success) {
    const msg = extraValidation.error.issues.map((i) => i.message).join("; ");
    res.status(400).json({ error: msg });
    return;
  }

  const coerced = coerceNumericFields(req.body);
  const parsed = insertTenantBookingSchema.safeParse(coerced);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    res.status(400).json({ error: msg });
    return;
  }

  const data = parsed.data;

  if (data.unitCode && data.startDate && data.endDate) {
    const hasOverlap = await checkUnitOverlap(data.unitCode, data.startDate, data.endDate);
    if (hasOverlap) {
      res.status(409).json({ error: `Unit ${data.unitCode} sudah dibooking pada periode yang sama` });
      return;
    }
  }

  try {
    const [booking] = await db
      .insert(tenantBookingsTable)
      .values(data)
      .returning();

    const [withTenant] = await db
      .select(bookingSelect)
      .from(tenantBookingsTable)
      .leftJoin(tenantsTable, eq(tenantBookingsTable.tenantId, tenantsTable.id))
      .where(eq(tenantBookingsTable.id, booking.id));

    res.status(201).json({ ...withTenant, contractStatus: computeContractStatus(withTenant) });
  } catch (err) {
    req.log.error(err, "Failed to create booking");
    res.status(500).json({ error: "Gagal membuat kontrak" });
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
      res.status(404).json({ error: "Kontrak tidak ditemukan" });
      return;
    }
    res.json({ ...row, contractStatus: computeContractStatus(row) });
  } catch (err) {
    req.log.error(err, "Failed to get booking");
    res.status(500).json({ error: "Gagal mengambil kontrak" });
  }
});

router.put("/bookings/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "ID tidak valid" });
    return;
  }

  const extraValidation = contractValidationSchema.safeParse(req.body);
  if (!extraValidation.success) {
    const msg = extraValidation.error.issues.map((i) => i.message).join("; ");
    res.status(400).json({ error: msg });
    return;
  }

  const coerced2 = coerceNumericFields(req.body);
  const parsed = insertTenantBookingSchema.safeParse(coerced2);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    res.status(400).json({ error: msg });
    return;
  }

  const data = parsed.data;

  if (data.unitCode && data.startDate && data.endDate) {
    const hasOverlap = await checkUnitOverlap(data.unitCode, data.startDate, data.endDate, id);
    if (hasOverlap) {
      res.status(409).json({ error: `Unit ${data.unitCode} sudah dibooking pada periode yang sama` });
      return;
    }
  }

  try {
    const [updated] = await db
      .update(tenantBookingsTable)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(tenantBookingsTable.id, id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Kontrak tidak ditemukan" });
      return;
    }

    const [withTenant] = await db
      .select(bookingSelect)
      .from(tenantBookingsTable)
      .leftJoin(tenantsTable, eq(tenantBookingsTable.tenantId, tenantsTable.id))
      .where(eq(tenantBookingsTable.id, id));

    res.json({ ...withTenant, contractStatus: computeContractStatus(withTenant) });
  } catch (err) {
    req.log.error(err, "Failed to update booking");
    res.status(500).json({ error: "Gagal memperbarui kontrak" });
  }
});

export default router;
