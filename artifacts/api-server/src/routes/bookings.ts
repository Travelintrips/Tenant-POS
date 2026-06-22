import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  tenantBookingsTable,
  tenantsTable,
  tenantInvoicesTable,
  waLogsTable,
  insertTenantBookingSchema,
} from "@workspace/db/schema";
import { eq, and, ne, lt, lte, gte, or } from "drizzle-orm";
import { requireAnyRole } from "../middlewares/auth";
import { logAudit } from "../lib/audit";
import { sseBroker } from "../lib/sse-broker";
import {
  sendBookingConfirmation,
  sendContractActivated,
  sendContractExpiringSoon,
  sendContractTerminated,
  getSiteCompanyName,
} from "../lib/whatsapp";
import { z } from "zod";

const router: IRouter = Router();

router.use("/bookings", requireAnyRole("owner", "admin", "finance"));

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
  siteId: tenantBookingsTable.siteId,
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
    const siteId = req.siteId;
    const siteConditions = siteId > 0 ? [eq(tenantBookingsTable.siteId, siteId)] : [];

    const rows = await db
      .select(bookingSelect)
      .from(tenantBookingsTable)
      .leftJoin(tenantsTable, eq(tenantBookingsTable.tenantId, tenantsTable.id))
      .where(siteConditions.length > 0 ? and(...siteConditions) : undefined)
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

  const bodyWithSite = req.siteId > 0 ? { ...req.body, siteId: req.siteId } : req.body;
  const coerced = coerceNumericFields(bodyWithSite);
  const parsed = insertTenantBookingSchema.safeParse(coerced);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    res.status(400).json({ error: msg });
    return;
  }

  const autoOrderNumber = `ORD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const data = {
    ...parsed.data,
    siteId: req.siteId > 0 ? req.siteId : parsed.data.siteId,
    orderNumber: parsed.data.orderNumber?.trim() || autoOrderNumber,
  };

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

    logAudit(req, {
      action: "create_booking",
      entityType: "booking",
      entityId: booking.id,
      afterData: withTenant,
    });

    sseBroker.publish("booking_updated", { bookingId: booking.id });
    res.status(201).json({ ...withTenant, contractStatus: computeContractStatus(withTenant) });

    // Kirim notifikasi WA ke tenant — fire-and-forget, tidak memblokir response
    if (withTenant) {
      const [tenant] = await db
        .select({ phone: tenantsTable.phone, ownerName: tenantsTable.ownerName })
        .from(tenantsTable)
        .where(eq(tenantsTable.id, withTenant.tenantId!));

      const phone = tenant?.phone;
      if (phone) {
        getSiteCompanyName(withTenant.siteId ?? null).then(companyName =>
          sendBookingConfirmation({
            ownerName: tenant.ownerName ?? withTenant.tenantName ?? "Tenant",
            businessName: withTenant.tenantName ?? "-",
            orderNumber: withTenant.orderNumber ?? "",
            contractNumber: withTenant.contractNumber,
            unitCode: withTenant.unitCode ?? "-",
            floor: withTenant.floor,
            startDate: withTenant.startDate ?? "",
            endDate: withTenant.endDate ?? "",
            durationMonths: withTenant.durationMonths,
            rentAmount: withTenant.rentAmount ?? "0",
            totalAmount: withTenant.totalAmount,
            dueDate: withTenant.dueDate,
            phone,
            companyName,
          })
        ).then(async (result) => {
          try {
            await db.insert(waLogsTable).values({
              siteId: withTenant.siteId ?? null,
              tenantId: withTenant.tenantId ?? null,
              invoiceId: null,
              phone,
              messageType: "booking_confirmation",
              status: result.skipped ? "skipped" : result.ok ? "sent" : "failed",
              errorMessage: result.error ?? null,
              sentBy: (req.user as { email?: string } | undefined)?.email ?? null,
            });
          } catch { /* jangan gagalkan jika logging error */ }
        }).catch(() => { /* abaikan error WA */ });
      }
    }
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
    const idConditions: ReturnType<typeof eq>[] = [eq(tenantBookingsTable.id, id)];
    if (req.siteId > 0) idConditions.push(eq(tenantBookingsTable.siteId, req.siteId) as any);

    const [row] = await db
      .select(bookingSelect)
      .from(tenantBookingsTable)
      .leftJoin(tenantsTable, eq(tenantBookingsTable.tenantId, tenantsTable.id))
      .where(and(...idConditions));

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
    const [before] = await db
      .select(bookingSelect)
      .from(tenantBookingsTable)
      .leftJoin(tenantsTable, eq(tenantBookingsTable.tenantId, tenantsTable.id))
      .where(eq(tenantBookingsTable.id, id));

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

    logAudit(req, {
      action: "update_booking",
      entityType: "booking",
      entityId: id,
      beforeData: before,
      afterData: withTenant,
    });

    sseBroker.publish("booking_updated", { bookingId: id });
    res.json({ ...withTenant, contractStatus: computeContractStatus(withTenant) });

    // Notifikasi WA saat status kontrak berubah — fire-and-forget
    const newStatus = computeContractStatus(withTenant);
    const oldStatus = before ? computeContractStatus(before) : null;
    const statusChanged = newStatus !== oldStatus;
    if (statusChanged && withTenant) {
      const [tenant] = await db
        .select({ phone: tenantsTable.phone, ownerName: tenantsTable.ownerName })
        .from(tenantsTable)
        .where(eq(tenantsTable.id, withTenant.tenantId!));
      const phone = tenant?.phone;
      if (phone) {
        const sentBy = (req.user as { email?: string } | undefined)?.email ?? null;
        let waPromise: Promise<import("../lib/whatsapp").WaResult> | null = null;
        let msgType = "";
        const contractCompanyName = await getSiteCompanyName(withTenant.siteId ?? null);

        if (newStatus === "active" && oldStatus !== "active") {
          msgType = "contract_activated";
          waPromise = sendContractActivated({
            ownerName: tenant.ownerName ?? withTenant.tenantName ?? "Tenant",
            businessName: withTenant.tenantName ?? "-",
            contractNumber: withTenant.contractNumber,
            orderNumber: withTenant.orderNumber ?? "",
            unitCode: withTenant.unitCode ?? "-",
            floor: withTenant.floor,
            startDate: withTenant.startDate ?? "",
            endDate: withTenant.endDate ?? "",
            phone,
            companyName: contractCompanyName,
          });
        } else if (newStatus === "expiring_soon" && oldStatus !== "expiring_soon") {
          msgType = "contract_expiring_soon";
          const daysLeft = withTenant.endDate
            ? Math.ceil((new Date(withTenant.endDate).getTime() - Date.now()) / 86400000)
            : 30;
          waPromise = sendContractExpiringSoon({
            ownerName: tenant.ownerName ?? withTenant.tenantName ?? "Tenant",
            businessName: withTenant.tenantName ?? "-",
            contractNumber: withTenant.contractNumber,
            orderNumber: withTenant.orderNumber ?? "",
            unitCode: withTenant.unitCode ?? "-",
            endDate: withTenant.endDate ?? "",
            daysLeft: Math.max(1, daysLeft),
            phone,
            companyName: contractCompanyName,
          });
        }

        if (waPromise && msgType) {
          waPromise.then(async (result) => {
            try {
              await db.insert(waLogsTable).values({
                siteId: withTenant.siteId ?? null,
                tenantId: withTenant.tenantId ?? null,
                invoiceId: null,
                phone,
                messageType: msgType,
                status: result.skipped ? "skipped" : result.ok ? "sent" : "failed",
                errorMessage: result.error ?? null,
                sentBy,
              });
            } catch { /* abaikan error logging */ }
          }).catch(() => {});
        }
      }
    }
  } catch (err) {
    req.log.error(err, "Failed to update booking");
    res.status(500).json({ error: "Gagal memperbarui kontrak" });
  }
});

// ─── POST /api/bookings/:id/terminate ─────────────────────────────────────────
router.post("/bookings/:id/terminate", requireAnyRole("owner", "admin"), async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "ID tidak valid" });
    return;
  }

  const { reason } = req.body as { reason?: string };

  try {
    const [before] = await db
      .select(bookingSelect)
      .from(tenantBookingsTable)
      .leftJoin(tenantsTable, eq(tenantBookingsTable.tenantId, tenantsTable.id))
      .where(eq(tenantBookingsTable.id, id));

    if (!before) {
      res.status(404).json({ error: "Kontrak tidak ditemukan" });
      return;
    }

    const [updated] = await db
      .update(tenantBookingsTable)
      .set({
        contractStatus: "terminated",
        bookingStatus: "batal",
        adminNotes: reason ? `[TERMINATE] ${reason}` : "[TERMINATE]",
        updatedAt: new Date(),
      })
      .where(eq(tenantBookingsTable.id, id))
      .returning();

    logAudit(req, {
      action: "terminate_booking",
      entityType: "booking",
      entityId: id,
      beforeData: before,
      afterData: { ...before, contractStatus: "terminated", reason },
    });

    res.json({ success: true, booking: updated });

    // Notifikasi WA terminasi — fire-and-forget
    if (before) {
      const [tenant] = await db
        .select({ phone: tenantsTable.phone, ownerName: tenantsTable.ownerName })
        .from(tenantsTable)
        .where(eq(tenantsTable.id, before.tenantId!));
      const phone = tenant?.phone;
      if (phone) {
        const sentBy = (req.user as { email?: string } | undefined)?.email ?? null;
        const terminateCompanyName = await getSiteCompanyName(before.siteId ?? null);
        sendContractTerminated({
          ownerName: tenant.ownerName ?? before.tenantName ?? "Tenant",
          businessName: before.tenantName ?? "-",
          contractNumber: before.contractNumber,
          orderNumber: before.orderNumber ?? "",
          unitCode: before.unitCode ?? "-",
          reason: reason ?? null,
          phone,
          companyName: terminateCompanyName,
        }).then(async (result) => {
          try {
            await db.insert(waLogsTable).values({
              siteId: before.siteId ?? null,
              tenantId: before.tenantId ?? null,
              invoiceId: null,
              phone,
              messageType: "contract_terminated",
              status: result.skipped ? "skipped" : result.ok ? "sent" : "failed",
              errorMessage: result.error ?? null,
              sentBy,
            });
          } catch { /* abaikan error logging */ }
        }).catch(() => {});
      }
    }
  } catch (err) {
    req.log.error(err, "Failed to terminate booking");
    res.status(500).json({ error: "Gagal mengakhiri kontrak" });
  }
});

// ─── DELETE /api/bookings/:id ─────────────────────────────────────────────────
router.delete("/bookings/:id", requireAnyRole("owner", "admin"), async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid" }); return; }

  try {
    const [existing] = await db
      .select(bookingSelect)
      .from(tenantBookingsTable)
      .leftJoin(tenantsTable, eq(tenantBookingsTable.tenantId, tenantsTable.id))
      .where(eq(tenantBookingsTable.id, id));

    if (!existing) { res.status(404).json({ error: "Kontrak tidak ditemukan" }); return; }

    const isActive = existing.contractStatus === "active" || existing.contractStatus === "expiring_soon";
    if (isActive) {
      res.status(409).json({ error: "Kontrak yang masih aktif tidak dapat dihapus. Gunakan fitur Terminasi terlebih dahulu." });
      return;
    }

    const relatedInvoices = await db
      .select({ id: tenantInvoicesTable.id, status: tenantInvoicesTable.status })
      .from(tenantInvoicesTable)
      .where(and(
        eq(tenantInvoicesTable.bookingId, id),
        eq(tenantInvoicesTable.status, "paid"),
      ));

    if (relatedInvoices.length > 0) {
      res.status(409).json({ error: "Kontrak yang sudah memiliki invoice lunas tidak dapat dihapus" });
      return;
    }

    await db.delete(tenantBookingsTable).where(eq(tenantBookingsTable.id, id));

    logAudit(req, {
      action: "delete_booking",
      entityType: "booking",
      entityId: id,
      beforeData: existing,
    });

    res.json({ success: true, message: "Kontrak berhasil dihapus" });
  } catch (err) {
    req.log.error(err, "Failed to delete booking");
    res.status(500).json({ error: "Gagal menghapus kontrak" });
  }
});

export default router;
