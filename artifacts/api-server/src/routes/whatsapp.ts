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
      res.json({ ok: true, skipped: true, paymentLink: paymentLink ?? null, message: "FONNTE_TOKEN belum dikonfigurasi. Pesan tidak terkirim." });
      return;
    }

    if (!result.ok) {
      await logWa({ siteId: req.siteId, tenantId: invoice.tenantId, invoiceId: id, phone: invoice.phone, messageType: "invoice", status: "failed", errorMessage: result.error, sentBy });
      res.json({ ok: false, waFailed: true, error: result.error ?? "Gagal kirim WA", paymentLink: paymentLink ?? null });
      return;
    }

    if (result.pending) {
      await logWa({ siteId: req.siteId, tenantId: invoice.tenantId, invoiceId: id, phone: invoice.phone, messageType: "invoice", status: "sent", errorMessage: "process:pending", sentBy });
      res.json({ ok: true, pending: true, paymentLink: paymentLink ?? null, message: "Pesan masuk antrian Fonnte namun belum terkirim ke WA. Reconnect device di dashboard Fonnte." });
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
      res.json({ ok: true, skipped: true, message: "FONNTE_TOKEN belum dikonfigurasi. Pesan tidak terkirim." });
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
      res.json({ ok: true, skipped: true, sent: 0, failed: 0, total: unpaidInvoices.length, message: "FONNTE_TOKEN belum dikonfigurasi. Blast tidak terkirim." });
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
 * Kirim pesan WA percobaan ke nomor tertentu (untuk verifikasi koneksi)
 */
router.post("/whatsapp/test-send", async (req, res) => {
  const { phone, message } = req.body as { phone?: string; message?: string };

  if (!phone || phone.trim().length < 8) {
    res.status(400).json({ error: "Nomor HP tidak valid. Masukkan minimal 8 digit." });
    return;
  }

  const token = process.env.FONNTE_API_KEY ?? process.env.FONNTE_TOKEN;
  if (!token) {
    res.status(400).json({ ok: false, skipped: true, error: "FONNTE_TOKEN belum dikonfigurasi di Replit Secrets." });
    return;
  }

  const testMsg = message?.trim() ||
    "✅ *Tes Koneksi WhatsApp Berhasil!*\n\nNotifikasi dari Portal Admin Mall sudah aktif dan berfungsi dengan baik.\n\n_Pesan ini dikirim otomatis oleh sistem._";

  const digits = phone.replace(/\D/g, "");
  const normalized = digits.startsWith("0") ? "62" + digits.slice(1) : digits.startsWith("62") ? digits : "62" + digits;
  const sender = process.env.FONNTE_SENDER ?? "";
  const params: Record<string, string> = { target: normalized, message: testMsg, delay: "1" };
  if (sender) params.sender = sender;

  try {
    const r = await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: { Authorization: token, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params).toString(),
      signal: AbortSignal.timeout(10000),
    });
    const data = await r.json() as Record<string, unknown>;
    const sentBy = (req.user as { email?: string } | undefined)?.email ?? null;
    const statusFailed = data["status"] === false || data["status"] === "false";
    const processFailed = data["process"] === false || data["process"] === "false";
    const processPending = data["process"] === "pending";

    if (!r.ok || statusFailed || processFailed) {
      const reason = String(data["reason"] ?? data["message"] ?? "Gagal kirim WA");
      const r2 = reason.toLowerCase();
      let errMsg = reason;
      if (r2.includes("disconnected")) errMsg = "Perangkat WhatsApp tidak terhubung. Scan ulang QR di dashboard Fonnte.";
      else if (r2.includes("invalid token") || r2.includes("unauthorized")) errMsg = "Token Fonnte tidak valid.";
      else if (r2.includes("target")) errMsg = "Nomor HP tujuan tidak valid.";
      await logWa({ phone: normalized, messageType: "test", status: "failed", errorMessage: errMsg, sentBy });
      res.json({ ok: false, error: errMsg, raw: reason });
    } else if (processPending) {
      await logWa({ phone: normalized, messageType: "test", status: "sent", errorMessage: "process:pending — sesi WA device mungkin expired", sentBy });
      res.json({
        ok: true,
        pending: true,
        message: `Pesan masuk antrian Fonnte ke ${normalized}, namun belum terkirim ke WA.`,
        detail: "Perangkat Fonnte perlu di-reconnect: buka dashboard.fonnte.com → pilih device → klik Disconnect lalu scan ulang QR code dengan HP yang terdaftar.",
        target: normalized,
      });
    } else {
      await logWa({ phone: normalized, messageType: "test", status: "sent", sentBy });
      res.json({ ok: true, message: `Pesan tes berhasil dikirim ke ${normalized}`, target: normalized });
    }
  } catch (err) {
    res.status(502).json({ ok: false, error: err instanceof Error ? err.message : "Gagal menghubungi Fonnte" });
  }
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
 * Ambil daftar perangkat/nomor HP yang terhubung ke akun Fonnte
 */
router.get("/whatsapp/devices", requireAuth, requireAnyRole("owner", "admin"), async (_req, res) => {
  const token = process.env.FONNTE_API_KEY ?? process.env.FONNTE_TOKEN;
  if (!token) {
    res.json({ configured: false, devices: [] });
    return;
  }

  try {
    const r = await fetch("https://api.fonnte.com/device", {
      method: "POST",
      headers: { Authorization: token, "Content-Type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(8000),
    });
    const data = await r.json() as Record<string, unknown>;

    if (!r.ok || data["status"] === false) {
      res.json({ configured: true, devices: [], error: String(data["reason"] ?? "Gagal ambil data device") });
      return;
    }

    // Fonnte /device (single device token) returns flat object, not array
    const isConnected = String(data["device_status"] ?? "").toLowerCase() === "connect";
    const devices = data["device"]
      ? [{
          name: String(data["name"] ?? "Perangkat"),
          phone: String(data["device"] ?? ""),
          status: isConnected ? "connected" : "disconnected",
          connected: isConnected,
          queueCount: Number(data["messages"] ?? 0),
          quota: String(data["quota"] ?? ""),
          expired: String(data["expired"] ?? ""),
        }]
      : [];

    res.json({ configured: true, devices });
  } catch {
    res.json({ configured: true, devices: [], error: "Gagal menghubungi Fonnte" });
  }
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
 * Panggil Fonnte /reconnect — restart koneksi device dan flush antrian yang stuck.
 * Biasanya membantu jika antrian menumpuk namun device masih terhubung.
 */
router.post("/whatsapp/reconnect-device", requireAuth, requireAnyRole("owner", "admin"), async (_req, res) => {
  const token = process.env.FONNTE_API_KEY ?? process.env.FONNTE_TOKEN;
  if (!token) {
    res.status(400).json({ ok: false, error: "FONNTE_TOKEN belum dikonfigurasi" });
    return;
  }

  try {
    const r = await fetch("https://api.fonnte.com/reconnect", {
      method: "POST",
      headers: { Authorization: token, "Content-Type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(15000),
    });
    const data = await r.json() as Record<string, unknown>;
    if (data["status"] === true) {
      res.json({ ok: true, message: "Reconnect berhasil. Device sedang restart — tunggu 15-30 detik lalu cek status kembali." });
    } else {
      res.json({ ok: false, error: String(data["reason"] ?? "Gagal reconnect") });
    }
  } catch {
    res.status(502).json({ ok: false, error: "Tidak dapat menghubungi server Fonnte" });
  }
});

/**
 * GET /api/whatsapp/status
 * Cek status konfigurasi WA + konektivitas perangkat Fonnte
 */
router.get("/whatsapp/status", async (_req, res) => {
  const token = process.env.FONNTE_API_KEY ?? process.env.FONNTE_TOKEN;
  if (!token) {
    res.json({ configured: false, connected: false, provider: "Fonnte", message: "FONNTE_TOKEN belum dikonfigurasi" });
    return;
  }

  try {
    // Gunakan /device API (lebih akurat, tidak membuat pesan dummy)
    const probe = await fetch("https://api.fonnte.com/device", {
      method: "POST",
      headers: { Authorization: token, "Content-Type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(8000),
    });
    const data = await probe.json() as Record<string, unknown>;

    const isConnected = String(data["device_status"] ?? "").toLowerCase() === "connect";
    const queueCount = Number(data["messages"] ?? 0);
    const quota = String(data["quota"] ?? "");
    const expired = String(data["expired"] ?? "");
    const devicePhone = String(data["device"] ?? "");

    // Peringatan antrian: lebih dari 50 pesan menumpuk
    const queueWarning = queueCount > 50
      ? `⚠️ ${queueCount.toLocaleString("id-ID")} pesan menumpuk di antrian Fonnte. Buka dashboard.fonnte.com → Device → klik "Hapus Antrian" untuk membersihkannya.`
      : undefined;

    const message = isConnected
      ? queueCount > 50
        ? `WhatsApp terhubung — ${queueCount.toLocaleString("id-ID")} pesan dalam antrian (belum terkirim)`
        : "WhatsApp aktif dan terhubung"
      : "Perangkat WhatsApp tidak terhubung — scan ulang QR di dashboard Fonnte";

    res.json({
      configured: true,
      connected: isConnected,
      provider: "Fonnte",
      message,
      queueCount,
      queueWarning,
      quota,
      expired,
      devicePhone,
    });
  } catch {
    res.json({ configured: true, connected: null, provider: "Fonnte", message: "Tidak dapat menghubungi server Fonnte" });
  }
});

export default router;
