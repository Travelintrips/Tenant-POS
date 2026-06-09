import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { tenantInvoicesTable, tenantsTable, tenantBookingsTable } from "@workspace/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { requireAnyRole, requireAuth } from "../middlewares/auth";
import {
  sendInvoiceNotification,
  sendPaymentConfirmation,
  sendOverdueReminder,
} from "../lib/whatsapp";

const router: IRouter = Router();

router.use("/whatsapp", requireAuth, requireAnyRole("owner", "admin", "finance"));

/**
 * POST /api/whatsapp/invoice/:id/send
 * Kirim notifikasi invoice ke nomor WA tenant
 */
router.post("/whatsapp/invoice/:id/send", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid" }); return; }

  try {
    const [invoice] = await db
      .select({
        id: tenantInvoicesTable.id,
        invoiceNumber: tenantInvoicesTable.invoiceNumber,
        periodStart: tenantInvoicesTable.periodStart,
        periodEnd: tenantInvoicesTable.periodEnd,
        dueDate: tenantInvoicesTable.dueDate,
        totalAmount: tenantInvoicesTable.totalAmount,
        status: tenantInvoicesTable.status,
        tenantId: tenantInvoicesTable.tenantId,
        ownerName: tenantsTable.ownerName,
        businessName: tenantsTable.businessName,
        phone: tenantsTable.phone,
      })
      .from(tenantInvoicesTable)
      .innerJoin(tenantsTable, eq(tenantInvoicesTable.tenantId, tenantsTable.id))
      .where(eq(tenantInvoicesTable.id, id));

    if (!invoice) { res.status(404).json({ error: "Invoice tidak ditemukan" }); return; }
    if (!invoice.phone) { res.status(400).json({ error: "Nomor HP tenant tidak terdaftar" }); return; }

    const periodLabel = invoice.periodStart && invoice.periodEnd
      ? `${invoice.periodStart} s/d ${invoice.periodEnd}`
      : "-";

    const dueStr = invoice.dueDate
      ? new Date(invoice.dueDate).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })
      : "-";

    const result = await sendInvoiceNotification({
      ownerName: invoice.ownerName,
      businessName: invoice.businessName,
      invoiceNumber: invoice.invoiceNumber,
      periodLabel,
      totalAmount: invoice.totalAmount,
      dueDate: dueStr,
      phone: invoice.phone,
    });

    if (result.skipped) {
      res.json({ ok: true, skipped: true, message: "FONNTE_TOKEN belum dikonfigurasi. Pesan tidak terkirim." });
      return;
    }

    if (!result.ok) {
      res.status(502).json({ error: "Gagal kirim WA", detail: result.error });
      return;
    }

    res.json({ ok: true, message: `Notifikasi invoice berhasil dikirim ke ${invoice.phone}` });
  } catch (err) {
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

/**
 * POST /api/whatsapp/invoice/:id/overdue-reminder
 * Kirim pengingat tagihan overdue
 */
router.post("/whatsapp/invoice/:id/overdue-reminder", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid" }); return; }

  try {
    const [invoice] = await db
      .select({
        id: tenantInvoicesTable.id,
        invoiceNumber: tenantInvoicesTable.invoiceNumber,
        dueDate: tenantInvoicesTable.dueDate,
        totalAmount: tenantInvoicesTable.totalAmount,
        outstandingAmount: tenantInvoicesTable.outstandingAmount,
        status: tenantInvoicesTable.status,
        ownerName: tenantsTable.ownerName,
        businessName: tenantsTable.businessName,
        phone: tenantsTable.phone,
      })
      .from(tenantInvoicesTable)
      .innerJoin(tenantsTable, eq(tenantInvoicesTable.tenantId, tenantsTable.id))
      .where(eq(tenantInvoicesTable.id, id));

    if (!invoice) { res.status(404).json({ error: "Invoice tidak ditemukan" }); return; }
    if (!invoice.phone) { res.status(400).json({ error: "Nomor HP tenant tidak terdaftar" }); return; }

    const dueDate = invoice.dueDate ? new Date(invoice.dueDate) : null;
    const daysOverdue = dueDate
      ? Math.max(0, Math.floor((Date.now() - dueDate.getTime()) / 86400000))
      : 0;

    const result = await sendOverdueReminder({
      ownerName: invoice.ownerName,
      businessName: invoice.businessName,
      invoiceNumber: invoice.invoiceNumber,
      totalAmount: invoice.totalAmount,
      outstandingAmount: invoice.outstandingAmount ?? invoice.totalAmount,
      daysOverdue,
      phone: invoice.phone,
    });

    if (result.skipped) {
      res.json({ ok: true, skipped: true, message: "FONNTE_TOKEN belum dikonfigurasi. Pesan tidak terkirim." });
      return;
    }

    if (!result.ok) {
      res.status(502).json({ error: "Gagal kirim WA", detail: result.error });
      return;
    }

    res.json({ ok: true, message: `Pengingat overdue berhasil dikirim ke ${invoice.phone}` });
  } catch (err) {
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

/**
 * POST /api/whatsapp/blast-overdue
 * Kirim pengingat ke SEMUA invoice overdue sekaligus
 */
router.post("/whatsapp/blast-overdue", async (req, res) => {
  try {
    const overdueInvoices = await db
      .select({
        id: tenantInvoicesTable.id,
        invoiceNumber: tenantInvoicesTable.invoiceNumber,
        dueDate: tenantInvoicesTable.dueDate,
        totalAmount: tenantInvoicesTable.totalAmount,
        outstandingAmount: tenantInvoicesTable.outstandingAmount,
        ownerName: tenantsTable.ownerName,
        businessName: tenantsTable.businessName,
        phone: tenantsTable.phone,
      })
      .from(tenantInvoicesTable)
      .innerJoin(tenantsTable, eq(tenantInvoicesTable.tenantId, tenantsTable.id))
      .where(eq(tenantInvoicesTable.status, "overdue"));

    if (overdueInvoices.length === 0) {
      res.json({ ok: true, sent: 0, message: "Tidak ada invoice overdue." });
      return;
    }

    let sent = 0;
    let failed = 0;
    let skipped = false;

    for (const invoice of overdueInvoices) {
      if (!invoice.phone) { failed++; continue; }

      const dueDate = invoice.dueDate ? new Date(invoice.dueDate) : null;
      const daysOverdue = dueDate
        ? Math.max(0, Math.floor((Date.now() - dueDate.getTime()) / 86400000))
        : 0;

      const result = await sendOverdueReminder({
        ownerName: invoice.ownerName,
        businessName: invoice.businessName,
        invoiceNumber: invoice.invoiceNumber,
        totalAmount: invoice.totalAmount,
        outstandingAmount: invoice.outstandingAmount ?? invoice.totalAmount,
        daysOverdue,
        phone: invoice.phone,
      });

      if (result.skipped) { skipped = true; break; }
      if (result.ok) sent++; else failed++;
    }

    if (skipped) {
      res.json({ ok: true, skipped: true, message: "FONNTE_TOKEN belum dikonfigurasi. Blast tidak terkirim." });
      return;
    }

    res.json({ ok: true, sent, failed, total: overdueInvoices.length,
      message: `Blast selesai: ${sent} terkirim, ${failed} gagal dari ${overdueInvoices.length} invoice overdue.` });
  } catch (err) {
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

/**
 * GET /api/whatsapp/status
 * Cek status konfigurasi WA
 */
router.get("/whatsapp/status", (_req, res) => {
  const configured = !!process.env.FONNTE_TOKEN;
  res.json({ configured, provider: "Fonnte", message: configured ? "WhatsApp aktif" : "FONNTE_TOKEN belum dikonfigurasi" });
});

export default router;
