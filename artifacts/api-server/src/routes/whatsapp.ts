import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { tenantInvoicesTable, tenantsTable, tenantBookingsTable, waLogsTable } from "@workspace/db/schema";
import { eq, and, inArray, desc, sql } from "drizzle-orm";
import crypto from "node:crypto";
import { requireAnyRole, requireAuth } from "../middlewares/auth";
import { getBaseUrl } from "../lib/app-url";
import {
  sendInvoiceNotification,
  sendPaymentConfirmation,
  sendOverdueReminder,
  getSiteCompanyName,
} from "../lib/whatsapp";
import {
  getCstWaGatewayStatus,
  normalizeWhatsappDestination,
  sendGatewayText,
} from "../lib/whatsapp-gateway-client";

const recentTestSends = new Map<string, number>();
const TEST_SEND_COOLDOWN_MS = 30 * 1000;

async function logWa(params: {
  siteId?: number | null;
  tenantId?: number | null;
  invoiceId?: number | null;
  phone: string;
  messageType: string;
  status: "sent" | "failed" | "skipped";
  errorMessage?: string | null;
  sentBy?: string | null;
}) {
  try {
    await db.insert(waLogsTable).values({
      siteId: params.siteId ?? null,
      tenantId: params.tenantId ?? null,
      invoiceId: params.invoiceId ?? null,
      phone: params.phone,
      messageType: params.messageType,
      status: params.status,
      errorMessage: params.errorMessage ?? null,
      sentBy: params.sentBy ?? null,
    });
  } catch {
    // jangan gagalkan request utama jika logging error
  }
}

/**
 * Cek apakah WA jenis tertentu sudah dikirim baru-baru ini (anti-spam / cooldown).
 * Mengembalikan { recent: true, sentAt } jika sudah, { recent: false } jika belum.
 */
async function hasSentRecently(params: {
  invoiceId?: number | null;
  siteId?: number | null;
  messageType: string;
  withinHours: number;
}): Promise<{ recent: boolean; sentAt?: Date }> {
  const conditions: ReturnType<typeof eq>[] = [
    eq(waLogsTable.messageType, params.messageType),
    eq(waLogsTable.status, "sent"),
    sql`${waLogsTable.createdAt} > NOW() - (${params.withinHours} * INTERVAL '1 hour')`,
  ];
  if (params.invoiceId != null) conditions.push(eq(waLogsTable.invoiceId, params.invoiceId));
  if (params.siteId != null) conditions.push(eq(waLogsTable.siteId, params.siteId));

  const [row] = await db
    .select({ sentAt: waLogsTable.createdAt })
    .from(waLogsTable)
    .where(and(...conditions))
    .orderBy(desc(waLogsTable.createdAt))
    .limit(1);

  return row ? { recent: true, sentAt: row.sentAt as Date } : { recent: false };
}

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
        paymentToken: tenantInvoicesTable.paymentToken,
        ownerName: tenantsTable.ownerName,
        businessName: tenantsTable.businessName,
        phone: tenantsTable.phone,
      })
      .from(tenantInvoicesTable)
      .innerJoin(tenantsTable, eq(tenantInvoicesTable.tenantId, tenantsTable.id))
      .where(eq(tenantInvoicesTable.id, id));

    if (!invoice) { res.status(404).json({ error: "Invoice tidak ditemukan" }); return; }
    if (invoice.status === "cancelled") {
      res.status(409).json({ ok: false, error: "Invoice yang dibatalkan tidak dapat dikirim sebagai tagihan" });
      return;
    }
    if (invoice.status === "paid") {
      res.status(409).json({ ok: false, error: "Invoice sudah lunas dan tidak perlu ditagih" });
      return;
    }
    if (invoice.periodStart) {
      const todayWib = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit",
      }).format(new Date());
      if (invoice.periodStart > todayWib) {
        res.status(409).json({ ok: false, error: "Periode invoice belum dimulai sehingga belum dapat ditagih" });
        return;
      }
    }
    if (!invoice.phone) { res.status(400).json({ error: "Nomor HP tenant tidak terdaftar" }); return; }

    // Cooldown 6 jam — cegah kirim berulang untuk invoice yang sama
    const cooldown = await hasSentRecently({ invoiceId: id, messageType: "invoice", withinHours: 6 });
    if (cooldown.recent) {
      const sentAt = cooldown.sentAt?.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) ?? "-";
      res.status(429).json({ ok: false, cooldown: true, error: `Notifikasi invoice ini sudah dikirim pada ${sentAt}. Tunggu 6 jam sebelum kirim ulang.` });
      return;
    }

    const periodLabel = invoice.periodStart && invoice.periodEnd
      ? `${invoice.periodStart} s/d ${invoice.periodEnd}`
      : "-";

    const dueStr = invoice.dueDate
      ? new Date(invoice.dueDate).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })
      : "-";

    const _baseUrl = await getBaseUrl();

    // Jika invoice belum punya paymentToken, generate dan simpan sekarang
    let paymentToken = invoice.paymentToken;
    if (!paymentToken && _baseUrl) {
      paymentToken = crypto.randomBytes(6).toString("hex"); // 12 hex chars
      await db
        .update(tenantInvoicesTable)
        .set({ paymentToken })
        .where(eq(tenantInvoicesTable.id, id));
    }

    const paymentLink = paymentToken && _baseUrl
      ? `${_baseUrl}/bayar/${paymentToken}`
      : undefined;

    const companyName = await getSiteCompanyName(req.siteId);
    const result = await sendInvoiceNotification({
      ownerName: invoice.ownerName,
      businessName: invoice.businessName,
      invoiceNumber: invoice.invoiceNumber,
      periodLabel,
      totalAmount: invoice.totalAmount,
      dueDate: dueStr,
      phone: invoice.phone,
      paymentLink,
      companyName,
    });

    const sentBy = (req.user as { email?: string } | undefined)?.email ?? null;
    if (result.skipped) {
      await logWa({ siteId: req.siteId, tenantId: invoice.tenantId, invoiceId: id, phone: invoice.phone, messageType: "invoice", status: "skipped", sentBy });
      res.json({ ok: true, skipped: true, paymentLink: paymentLink ?? null, message: "CST WA Gateway belum dikonfigurasi. Pesan tidak terkirim." });
      return;
    }

    if (!result.ok) {
      await logWa({ siteId: req.siteId, tenantId: invoice.tenantId, invoiceId: id, phone: invoice.phone, messageType: "invoice", status: "failed", errorMessage: result.error, sentBy });
      res.json({ ok: false, waFailed: true, error: result.error ?? "Gagal kirim WA", paymentLink: paymentLink ?? null });
      return;
    }

    if (result.pending) {
      await logWa({ siteId: req.siteId, tenantId: invoice.tenantId, invoiceId: id, phone: invoice.phone, messageType: "invoice", status: "sent", errorMessage: "process:pending", sentBy });
      res.json({ ok: true, pending: true, paymentLink: paymentLink ?? null, message: `Invoice masuk antrian CST WA Gateway ke ${invoice.phone} — akan terkirim dalam beberapa saat.` });
      return;
    }

    await logWa({ siteId: req.siteId, tenantId: invoice.tenantId, invoiceId: id, phone: invoice.phone, messageType: "invoice", status: "sent", sentBy });
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
        tenantId: tenantInvoicesTable.tenantId,
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
    if (invoice.status !== "overdue" || Number(invoice.outstandingAmount ?? 0) <= 0) {
      res.status(409).json({ ok: false, error: "Pengingat overdue hanya dapat dikirim untuk invoice overdue dengan sisa tagihan aktif" });
      return;
    }
    if (!invoice.phone) { res.status(400).json({ error: "Nomor HP tenant tidak terdaftar" }); return; }

    // Cooldown 24 jam — pengingat overdue tidak boleh dikirim lebih dari sekali sehari
    const cooldown = await hasSentRecently({ invoiceId: id, messageType: "overdue_reminder", withinHours: 24 });
    if (cooldown.recent) {
      const sentAt = cooldown.sentAt?.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) ?? "-";
      res.status(429).json({ ok: false, cooldown: true, error: `Pengingat overdue sudah dikirim pada ${sentAt}. Tunggu 24 jam sebelum kirim ulang.` });
      return;
    }

    const dueDate = invoice.dueDate ? new Date(invoice.dueDate) : null;
    const daysOverdue = dueDate
      ? Math.max(0, Math.floor((Date.now() - dueDate.getTime()) / 86400000))
      : 0;

    const companyNameOverdue = await getSiteCompanyName(req.siteId);
    const result = await sendOverdueReminder({
      ownerName: invoice.ownerName,
      businessName: invoice.businessName,
      invoiceNumber: invoice.invoiceNumber,
      totalAmount: invoice.totalAmount,
      outstandingAmount: invoice.outstandingAmount ?? invoice.totalAmount,
      daysOverdue,
      phone: invoice.phone,
      companyName: companyNameOverdue,
    });

    const sentBy = (req.user as { email?: string } | undefined)?.email ?? null;
    if (result.skipped) {
      await logWa({ siteId: req.siteId, tenantId: invoice.tenantId ?? null, invoiceId: id, phone: invoice.phone, messageType: "overdue_reminder", status: "skipped", sentBy });
      res.json({ ok: true, skipped: true, message: "CST WA Gateway belum dikonfigurasi. Pesan tidak terkirim." });
      return;
    }

    if (!result.ok) {
      await logWa({ siteId: req.siteId, tenantId: invoice.tenantId ?? null, invoiceId: id, phone: invoice.phone, messageType: "overdue_reminder", status: "failed", errorMessage: result.error, sentBy });
      res.status(502).json({ error: result.error ?? "Gagal kirim WA" });
      return;
    }

    await logWa({ siteId: req.siteId, tenantId: invoice.tenantId ?? null, invoiceId: id, phone: invoice.phone, messageType: "overdue_reminder", status: "sent", sentBy });
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
    // Cooldown 24 jam per site — cegah blast berulang dalam sehari
    const siteIdForCheck = req.siteId > 0 ? req.siteId : null;
    const cooldown = await hasSentRecently({ siteId: siteIdForCheck, messageType: "blast_overdue", withinHours: 24 });
    if (cooldown.recent) {
      const sentAt = cooldown.sentAt?.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) ?? "-";
      res.status(429).json({ ok: false, cooldown: true, error: `Blast overdue sudah dikirim pada ${sentAt}. Tunggu 24 jam sebelum kirim ulang.` });
      return;
    }

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
    const sentBy = (req.user as { email?: string } | undefined)?.email ?? null;

    for (const invoice of overdueInvoices) {
      if (!invoice.phone) { failed++; continue; }

      const dueDate = invoice.dueDate ? new Date(invoice.dueDate) : null;
      const daysOverdue = dueDate
        ? Math.max(0, Math.floor((Date.now() - dueDate.getTime()) / 86400000))
        : 0;

      const blastCompanyName = await getSiteCompanyName(req.siteId);
      const result = await sendOverdueReminder({
        ownerName: invoice.ownerName,
        businessName: invoice.businessName,
        invoiceNumber: invoice.invoiceNumber,
        totalAmount: invoice.totalAmount,
        outstandingAmount: invoice.outstandingAmount ?? invoice.totalAmount,
        daysOverdue,
        phone: invoice.phone,
        companyName: blastCompanyName,
      });

      if (result.skipped) {
        await logWa({ siteId: req.siteId, phone: invoice.phone, messageType: "blast_overdue", status: "skipped", sentBy });
        skipped = true; break;
      }
      if (result.ok) {
        await logWa({ siteId: req.siteId, phone: invoice.phone, messageType: "blast_overdue", status: "sent", sentBy });
        sent++;
      } else {
        await logWa({ siteId: req.siteId, phone: invoice.phone, messageType: "blast_overdue", status: "failed", errorMessage: result.error, sentBy });
        failed++;
      }
    }

    if (skipped) {
      res.json({ ok: true, skipped: true, message: "CST WA Gateway belum dikonfigurasi. Blast tidak terkirim." });
      return;
    }

    res.json({ ok: true, sent, failed, total: overdueInvoices.length,
      message: `Blast selesai: ${sent} terkirim, ${failed} gagal dari ${overdueInvoices.length} invoice overdue.` });
  } catch (err) {
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

/**
 * POST /api/whatsapp/blast-link-unpaid
 * Kirim link pembayaran ke SEMUA invoice belum lunas (unpaid + partial + overdue)
 */
router.post("/whatsapp/blast-link-unpaid", async (req, res) => {
  try {
    const siteId = req.siteId;

    // Cooldown 6 jam per site — cegah blast link berulang dalam sehari
    const siteIdForCheck = siteId > 0 ? siteId : null;
    const cooldown = await hasSentRecently({ siteId: siteIdForCheck, messageType: "blast_link", withinHours: 6 });
    if (cooldown.recent) {
      const sentAt = cooldown.sentAt?.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) ?? "-";
      res.status(429).json({ ok: false, cooldown: true, error: `Blast link sudah dikirim pada ${sentAt}. Tunggu 6 jam sebelum kirim ulang.` });
      return;
    }

    const siteFilter = siteId > 0 ? eq(tenantInvoicesTable.siteId, siteId) : undefined;

    const appDomain = await getBaseUrl();

    const unpaidInvoices = await db
      .select({
        id: tenantInvoicesTable.id,
        invoiceNumber: tenantInvoicesTable.invoiceNumber,
        periodStart: tenantInvoicesTable.periodStart,
        periodEnd: tenantInvoicesTable.periodEnd,
        dueDate: tenantInvoicesTable.dueDate,
        totalAmount: tenantInvoicesTable.totalAmount,
        paymentToken: tenantInvoicesTable.paymentToken,
        ownerName: tenantsTable.ownerName,
        businessName: tenantsTable.businessName,
        phone: tenantsTable.phone,
      })
      .from(tenantInvoicesTable)
      .innerJoin(tenantsTable, eq(tenantInvoicesTable.tenantId, tenantsTable.id))
      .where(and(
        inArray(tenantInvoicesTable.status, ["unpaid", "partial", "overdue"]),
        siteFilter,
      ));

    if (unpaidInvoices.length === 0) {
      res.json({ ok: true, sent: 0, failed: 0, total: 0, message: "Tidak ada invoice belum lunas." });
      return;
    }

    let sent = 0;
    let failed = 0;
    let skipped = false;
    let lastError: string | undefined;
    const sentBy = (req.user as { email?: string } | undefined)?.email ?? null;

    for (const invoice of unpaidInvoices) {
      if (!invoice.phone) { failed++; continue; }

      const periodLabel = invoice.periodStart && invoice.periodEnd
        ? `${invoice.periodStart} s/d ${invoice.periodEnd}`
        : "-";

      const dueStr = invoice.dueDate
        ? new Date(invoice.dueDate).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })
        : "-";

      // Jika invoice belum punya paymentToken, generate dan simpan sekarang
      let invoicePaymentToken = invoice.paymentToken;
      if (!invoicePaymentToken && appDomain) {
        invoicePaymentToken = crypto.randomBytes(6).toString("hex");
        await db
          .update(tenantInvoicesTable)
          .set({ paymentToken: invoicePaymentToken })
          .where(eq(tenantInvoicesTable.id, invoice.id));
      }

      const paymentLink = invoicePaymentToken && appDomain
        ? `${appDomain}/bayar/${invoicePaymentToken}`
        : undefined;

      const linkCompanyName = await getSiteCompanyName(siteId);
      const result = await sendInvoiceNotification({
        ownerName: invoice.ownerName,
        businessName: invoice.businessName,
        invoiceNumber: invoice.invoiceNumber,
        periodLabel,
        totalAmount: invoice.totalAmount,
        dueDate: dueStr,
        phone: invoice.phone,
        paymentLink,
        companyName: linkCompanyName,
      });

      if (result.skipped) {
        await logWa({ siteId, phone: invoice.phone, messageType: "blast_link", status: "skipped", sentBy });
        skipped = true; break;
      }
      if (result.ok) {
        await logWa({ siteId, phone: invoice.phone, messageType: "blast_link", status: "sent", sentBy });
        sent++;
      } else {
        await logWa({ siteId, phone: invoice.phone, messageType: "blast_link", status: "failed", errorMessage: result.error, sentBy });
        failed++; lastError = result.error;
      }
    }

    if (skipped) {
      res.json({ ok: true, skipped: true, sent: 0, failed: 0, total: unpaidInvoices.length, message: "CST WA Gateway belum dikonfigurasi. Blast tidak terkirim." });
      return;
    }

    res.json({
      ok: true, sent, failed, total: unpaidInvoices.length,
      message: failed > 0
        ? `Blast link selesai: ${sent} terkirim, ${failed} gagal. ${lastError ?? ""}`
        : `Blast link selesai: ${sent} terkirim dari ${unpaidInvoices.length} invoice belum lunas.`,
    });
  } catch (err) {
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

/**
 * POST /api/whatsapp/test-send
 * Kirim pesan WA percobaan melalui CST WA Gateway.
 */
router.post("/whatsapp/test-send", async (req, res) => {
  const { phone, message } = req.body as { phone?: string; message?: string };

  if (!phone || phone.trim().length < 8) {
    res.status(400).json({ error: "Nomor HP tidak valid. Masukkan minimal 8 digit." });
    return;
  }

  const testMsg = message?.trim() ||
    "✅ *Tes Koneksi WhatsApp Berhasil!*\n\nNotifikasi dari Portal Admin Mall sudah aktif melalui CST WA Gateway.\n\n_Pesan ini dikirim otomatis oleh sistem._";

  const normalized = normalizeWhatsappDestination(phone);
  const now = Date.now();
  const lastSentAt = recentTestSends.get(normalized);
  if (lastSentAt && now - lastSentAt < TEST_SEND_COOLDOWN_MS) {
    const waitSeconds = Math.ceil((TEST_SEND_COOLDOWN_MS - (now - lastSentAt)) / 1000);
    res.status(429).json({
      ok: false,
      cooldown: true,
      error: `Pesan tes ke tujuan ini baru saja dikirim. Tunggu ${waitSeconds} detik sebelum mencoba lagi.`,
    });
    return;
  }
  recentTestSends.set(normalized, now);

  const result = await sendGatewayText(normalized, testMsg);
  const sentBy = (req.user as { email?: string } | undefined)?.email ?? null;

  if (result.skipped) {
    recentTestSends.delete(normalized);
    await logWa({ phone: normalized, messageType: "test", status: "skipped", errorMessage: result.error, sentBy });
    res.status(400).json({ ok: false, skipped: true, error: result.error });
    return;
  }

  if (!result.ok) {
    recentTestSends.delete(normalized);
    await logWa({ phone: normalized, messageType: "test", status: "failed", errorMessage: result.error, sentBy });
    res.status(502).json({ ok: false, error: result.error ?? "Gagal mengirim melalui CST WA Gateway" });
    return;
  }

  await logWa({
    phone: normalized,
    messageType: "test",
    status: "sent",
    errorMessage: result.queued ? "CST WA Gateway queued" : null,
    sentBy,
  });
  res.json({
    ok: true,
    pending: Boolean(result.queued),
    isGroup: normalized.endsWith("@g.us"),
    messageId: result.messageId ?? null,
    message: `Pesan ke ${normalized} diterima CST WA Gateway dan masuk antrian pengiriman.`,
    target: normalized,
  });
});

/**
 * GET /api/whatsapp/logs
 * Riwayat pengiriman WA (50 terbaru)
 */
router.get("/whatsapp/logs", requireAuth, requireAnyRole("owner", "admin", "finance"), async (req, res) => {
  try {
    const siteId = req.siteId;
    const rows = await db
      .select()
      .from(waLogsTable)
      .where(siteId > 0 ? eq(waLogsTable.siteId, siteId) : undefined)
      .orderBy(desc(waLogsTable.createdAt))
      .limit(100);
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: "Gagal mengambil riwayat WA" });
  }
});

/**
 * GET /api/whatsapp/devices
 * Tampilkan status worker/device dari CST WA Gateway.
 */
router.get("/whatsapp/devices", requireAuth, requireAnyRole("owner", "admin"), async (_req, res) => {
  const status = await getCstWaGatewayStatus();
  const devices = (status.workers ?? []).map((worker) => ({
    name: String(worker["deviceId"] ?? worker["workerId"] ?? "WhatsApp"),
    phone: String(worker["phone"] ?? ""),
    status: String(worker["status"] ?? "UNKNOWN").toLowerCase(),
    connected: String(worker["status"] ?? "").toUpperCase() === "ONLINE",
    queueCount: status.queueCount ?? 0,
  }));
  res.json({ configured: status.configured, devices, provider: status.provider, error: status.connected === null ? status.message : undefined });
});

/**
 * GET /api/whatsapp/reminder-status
 * Daftar invoice belum lunas beserta status pengiriman reminder H-3, H-1, dan overdue
 */
router.get("/whatsapp/reminder-status", async (req, res) => {
  const siteId = (req as { siteId?: number }).siteId;

  const invoices = await db
    .select({
      id: tenantInvoicesTable.id,
      invoiceNumber: tenantInvoicesTable.invoiceNumber,
      dueDate: tenantInvoicesTable.dueDate,
      status: tenantInvoicesTable.status,
      totalAmount: tenantInvoicesTable.totalAmount,
      outstandingAmount: tenantInvoicesTable.outstandingAmount,
      dueReminder3dAt: tenantInvoicesTable.dueReminder3dAt,
      dueReminder1dAt: tenantInvoicesTable.dueReminder1dAt,
      lastOverdueReminderAt: tenantInvoicesTable.lastOverdueReminderAt,
      businessName: tenantsTable.businessName,
      ownerName: tenantsTable.ownerName,
      phone: tenantsTable.phone,
    })
    .from(tenantInvoicesTable)
    .innerJoin(tenantsTable, eq(tenantInvoicesTable.tenantId, tenantsTable.id))
    .where(
      and(
        siteId && siteId > 0
          ? eq(tenantInvoicesTable.siteId, siteId)
          : undefined,
        inArray(tenantInvoicesTable.status, ["unpaid", "partial", "overdue"]),
      ),
    )
    .orderBy(desc(tenantInvoicesTable.dueDate))
    .limit(100);

  res.json({ data: invoices });
});

/**
 * POST /api/whatsapp/reconnect-device
 * Reconnect device dikelola terpusat oleh CST WA Gateway. Tenant-POS sengaja
 * tidak memegang admin token gateway.
 */
router.post("/whatsapp/reconnect-device", requireAuth, requireAnyRole("owner", "admin"), async (_req, res) => {
  res.status(409).json({
    ok: false,
    centralized: true,
    provider: "CST WA Gateway",
    error: "Reconnect perangkat dikelola dari panel CST WA Gateway agar kredensial admin tidak dibagikan ke Tenant-POS.",
  });
});

/**
 * GET /api/whatsapp/status
 * Cek status CST WA Gateway dan worker WhatsApp.
 */
router.get("/whatsapp/status", async (_req, res) => {
  const status = await getCstWaGatewayStatus();
  res.json(status);
});

export default router;
