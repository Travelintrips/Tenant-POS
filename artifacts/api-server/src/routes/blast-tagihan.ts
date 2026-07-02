/**
 * blast-tagihan.ts
 * Route untuk trigger manual blast tagihan + cek status scheduler.
 * POST /blast-tagihan/trigger  — trigger semua pengecekan (kirim tagihan, reminder, overdue)
 * GET  /blast-tagihan/status   — ambil status terakhir scheduler
 */
import { Router, type IRouter } from "express";
import { requireAnyRole } from "../middlewares/auth";
import { getBlastStatus, getBlastHistory, runManualBlast } from "../lib/overdue-scheduler";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.use("/blast-tagihan", requireAnyRole("owner", "admin", "finance"));

/**
 * GET /blast-tagihan/status
 * Kembalikan status terakhir scheduler dan jadwal berikutnya.
 */
router.get("/blast-tagihan/status", (_req, res) => {
  const status = getBlastStatus();

  // Hitung jam WIB dari UTC
  const wibHours = status.nextScheduledHoursUtc.map((h) => ((h + 7) % 24));
  const wibLabels = wibHours
    .sort((a, b) => a - b)
    .map((h) => `${String(h).padStart(2, "0")}:00 WIB`);

  res.json({
    ...status,
    scheduledTimesWib: wibLabels,
    lastRunAtFormatted: status.lastRunAt
      ? new Date(status.lastRunAt).toLocaleString("id-ID", {
          timeZone: "Asia/Jakarta",
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : null,
  });
});

/**
 * POST /blast-tagihan/trigger
 * Trigger manual: jalankan semua pengecekan scheduler sekarang.
 * Ini akan mengirim:
 *   1. Tagihan baru (invoice_notified_at IS NULL, period_start <= hari ini)
 *   2. Pengingat H-7 / H-3 / H-1 sebelum jatuh tempo
 *   3. Pengingat overdue (sudah lewat jatuh tempo)
 *
 * Berjalan async — response langsung dikembalikan, proses berjalan di background.
 */
router.post("/blast-tagihan/trigger", (req, res) => {
  const user = (req as unknown as { user?: { name?: string; role?: string } }).user;
  const label = `manual by ${user?.name ?? "unknown"} (${user?.role ?? "-"})`;

  logger.info({ label }, "[blast-tagihan] Trigger manual diterima");

  // Cek apakah sedang berjalan
  const current = getBlastStatus();
  if (current.isRunning) {
    res.status(409).json({
      ok: false,
      message: "Proses blast sedang berjalan. Harap tunggu hingga selesai.",
    });
    return;
  }

  // Jalankan async di background — jangan tunggu selesai
  runManualBlast(label).catch((err) =>
    logger.warn({ err }, "[blast-tagihan] Proses manual blast gagal"),
  );

  res.json({
    ok: true,
    message:
      "Proses blast tagihan dimulai di background. " +
      "Periksa status di beberapa detik untuk melihat hasilnya.",
    startedAt: new Date().toISOString(),
  });
});

/**
 * GET /blast-tagihan/history
 * Kembalikan histori 20 run terakhir scheduler (in-memory, reset saat server restart).
 */
router.get("/blast-tagihan/history", (_req, res) => {
  const history = getBlastHistory().map((run) => ({
    ...run,
    runAtFormatted: new Date(run.runAt).toLocaleString("id-ID", {
      timeZone: "Asia/Jakarta",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
  }));
  res.json({ ok: true, history });
});

export default router;
