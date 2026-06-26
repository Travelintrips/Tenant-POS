import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { systemSettingsTable, mallSitesTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { requireAuth, requireAnyRole } from "../middlewares/auth";
import { invalidateBaseUrlCache } from "../lib/app-url";
import { getSiteCompanyName, clearCompanyNameCache } from "../lib/whatsapp";
import { logAudit } from "../lib/audit";

const router: IRouter = Router();

const SETTINGS_KEY = "mall_config";

const DEFAULT_SETTINGS = {
  mallName: "Mall Admin",
  tagline: "Manajemen Tenant Mall",
  address: "",
  phone: "",
  email: "",
  invoicePrefix: "INV-TENANT",
  taxRate: 0,
  currency: "IDR",
  logoUrl: "",
  adminPhone: "",
  waSenderPhone: "",
  waSenderLabel: "",
  paymentDomain: "",
  invoiceColor: "#1e3a5f",
  invoiceFooterNote: "",
  invoiceSignerName: "",
};

router.get("/settings", requireAuth, requireAnyRole("owner", "admin", "finance"), async (req, res) => {
  try {
    const [row] = await db
      .select()
      .from(systemSettingsTable)
      .where(eq(systemSettingsTable.key, SETTINGS_KEY));

    const value = (row?.value as Record<string, unknown>) ?? {};
    const companyName = await getSiteCompanyName(req.siteId);

    // Ambil logoUrl per-site dari mall_sites jika tersedia (override global)
    let siteLogoUrl: string | null = null;
    if (req.siteId > 0) {
      try {
        const [siteRow] = await db
          .select({ logoUrl: mallSitesTable.logoUrl })
          .from(mallSitesTable)
          .where(eq(mallSitesTable.id, req.siteId));
        if (siteRow?.logoUrl) siteLogoUrl = siteRow.logoUrl;
      } catch { /* abaikan */ }
    }

    const result = { ...DEFAULT_SETTINGS, ...value, companyName };
    if (siteLogoUrl) result.logoUrl = siteLogoUrl;
    res.json(result);
  } catch {
    res.json(DEFAULT_SETTINGS);
  }
});

router.put("/settings", requireAuth, requireAnyRole("owner"), async (req, res) => {
  try {
    const payload = req.body as Record<string, unknown>;

    const [existing] = await db
      .select()
      .from(systemSettingsTable)
      .where(eq(systemSettingsTable.key, SETTINGS_KEY));

    if (existing) {
      const [updated] = await db
        .update(systemSettingsTable)
        .set({ value: { ...(existing.value as object), ...payload }, updatedAt: new Date() })
        .where(eq(systemSettingsTable.key, SETTINGS_KEY))
        .returning();
      invalidateBaseUrlCache();
      res.json({ ...(updated.value as object) });
    } else {
      const [created] = await db
        .insert(systemSettingsTable)
        .values({ key: SETTINGS_KEY, value: { ...DEFAULT_SETTINGS, ...payload } })
        .returning();
      invalidateBaseUrlCache();
      res.json({ ...(created.value as object) });
    }

    if (payload.companyName && req.siteId > 0) {
      try {
        await db.execute(sql`UPDATE mall_sites SET company_name = ${String(payload.companyName)} WHERE id = ${req.siteId}`);
        clearCompanyNameCache(req.siteId);
      } catch { /* abaikan */ }
    }
  } catch (err) {
    res.status(500).json({ error: "Gagal menyimpan pengaturan" });
  }
});

// ── GET /api/settings/sites ───────────────────────────────────────────────────
// Ambil daftar semua site beserta companyName, logoUrl, invoiceColor (owner/admin/finance)
router.get("/settings/sites", requireAuth, requireAnyRole("owner", "admin", "finance"), async (_req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT id AS "siteId", name AS "siteName", company_name AS "companyName",
             logo_url AS "logoUrl", invoice_color AS "invoiceColor"
      FROM mall_sites
      WHERE code NOT LIKE 'KANTIN%'
      ORDER BY id ASC
    `);
    const data = (rows as unknown as { rows: { siteId: number; siteName: string; companyName: string | null; logoUrl: string | null; invoiceColor: string | null }[] }).rows;
    res.json(data.map(r => ({
      siteId: r.siteId,
      siteName: r.siteName,
      companyName: r.companyName ?? "",
      logoUrl: r.logoUrl ?? "",
      invoiceColor: r.invoiceColor ?? "",
    })));
  } catch {
    res.status(500).json({ error: "Gagal mengambil data site" });
  }
});

// ── PUT /api/settings/sites/:siteId/company ───────────────────────────────────
// Update companyName untuk site tertentu (owner only)
router.put("/settings/sites/:siteId/company", requireAuth, requireAnyRole("owner"), async (req, res) => {
  try {
    const siteId = Number(req.params.siteId);
    if (!siteId || isNaN(siteId)) {
      res.status(400).json({ error: "siteId tidak valid" });
      return;
    }

    const rawName = (req.body as { companyName?: unknown }).companyName;
    if (typeof rawName !== "string" || rawName.trim().length === 0) {
      res.status(400).json({ error: "Nama perusahaan wajib diisi" });
      return;
    }
    if (rawName.trim().length > 255) {
      res.status(400).json({ error: "Nama perusahaan maksimal 255 karakter" });
      return;
    }

    const companyName = rawName.trim().replace(/[<>"']/g, "");

    await db.execute(sql`
      UPDATE mall_sites SET company_name = ${companyName} WHERE id = ${siteId}
    `);
    clearCompanyNameCache(siteId);

    res.json({ success: true, siteId, companyName });
  } catch {
    res.status(500).json({ error: "Gagal menyimpan nama perusahaan" });
  }
});

// ── PUT /api/settings/sites/:siteId/color ────────────────────────────────────
// Update invoiceColor untuk site tertentu (owner only)
router.put("/settings/sites/:siteId/color", requireAuth, requireAnyRole("owner"), async (req, res) => {
  try {
    const siteId = Number(req.params.siteId);
    if (!siteId || isNaN(siteId)) {
      res.status(400).json({ error: "siteId tidak valid" }); return;
    }
    const rawColor = (req.body as { invoiceColor?: unknown }).invoiceColor;
    const isValid = typeof rawColor === "string" && (rawColor === "" || /^#[0-9A-Fa-f]{6}$/.test(rawColor));
    if (!isValid) {
      res.status(400).json({ error: "invoiceColor harus berupa hex warna (#RRGGBB) atau kosong" }); return;
    }
    await db.execute(sql`UPDATE mall_sites SET invoice_color = ${rawColor || null} WHERE id = ${siteId}`);
    res.json({ success: true, siteId, invoiceColor: rawColor });
  } catch {
    res.status(500).json({ error: "Gagal menyimpan warna site" });
  }
});

// ── PUT /api/settings/sites/:siteId/logo ─────────────────────────────────────
// Update logoUrl untuk site tertentu (owner only)
router.put("/settings/sites/:siteId/logo", requireAuth, requireAnyRole("owner"), async (req, res) => {
  try {
    const siteId = Number(req.params.siteId);
    if (!siteId || isNaN(siteId)) {
      res.status(400).json({ error: "siteId tidak valid" });
      return;
    }

    const rawUrl = (req.body as { logoUrl?: unknown }).logoUrl;
    // logoUrl wajib string (kosong = hapus logo, isi = URL valid)
    if (typeof rawUrl !== "string") {
      res.status(400).json({ error: "logoUrl harus berupa string" });
      return;
    }
    const logoUrl = rawUrl.trim();
    if (logoUrl.length > 0) {
      const isValid =
        logoUrl.startsWith("/uploads/") ||
        logoUrl.startsWith("https://") ||
        logoUrl.startsWith("http://");
      if (!isValid) {
        res.status(400).json({ error: "logoUrl tidak valid (harus /uploads/, https://, atau http://)" });
        return;
      }
    }

    await db
      .update(mallSitesTable)
      .set({ logoUrl: logoUrl || null, updatedAt: new Date() })
      .where(eq(mallSitesTable.id, siteId));

    res.json({ success: true, siteId, logoUrl });
  } catch {
    res.status(500).json({ error: "Gagal menyimpan logo site" });
  }
});

// ─── POST /api/admin/reset-transactions — Hanya Pemilik ──────────────────────
router.post(
  "/admin/reset-transactions",
  requireAuth,
  requireAnyRole("owner"),
  async (req, res) => {
    try {
      // Gunakan DELETE (bukan TRUNCATE) agar kompatibel dengan Supabase Transaction Pooler (PgBouncer).
      // TRUNCATE ... RESTART IDENTITY CASCADE tidak selalu berjalan mulus via PgBouncer.
      // Urutan delete: dari tabel yang punya FK ke tabel induk terlebih dahulu.
      await db.execute(sql`DELETE FROM gl_journal_bridge`);
      await db.execute(sql`DELETE FROM bank_journal_entries`);
      await db.execute(sql`DELETE FROM accounting_entry_lines`);
      await db.execute(sql`DELETE FROM accounting_entries`);
      await db.execute(sql`DELETE FROM accounting_payments`);
      await db.execute(sql`DELETE FROM bank_recon_audit_logs`);
      await db.execute(sql`DELETE FROM bank_reconciliation_matches`);
      await db.execute(sql`DELETE FROM bank_mutations`);
      await db.execute(sql`DELETE FROM bank_account_balances`);
      await db.execute(sql`DELETE FROM tax_transactions`);
      await db.execute(sql`DELETE FROM finance_payment_events`);
      await db.execute(sql`DELETE FROM tenant_receipts`);
      await db.execute(sql`DELETE FROM operational_expenses`);
      await db.execute(sql`DELETE FROM cashier_shifts`);
      await db.execute(sql`DELETE FROM tenant_payments`);
      await db.execute(sql`DELETE FROM tenant_invoices`);

      logAudit(req, {
        action: "reset_all_transactions",
        entityType: "system",
        entityId: 0,
        beforeData: null,
        afterData: { resetAt: new Date().toISOString(), resetBy: (req.user as any)?.name },
      });

      res.json({ success: true, message: "Semua data transaksi berhasil dihapus." });
    } catch (err) {
      req.log.error(err, "Gagal reset transaksi");
      res.status(500).json({ error: "Gagal menghapus data transaksi." });
    }
  }
);

export default router;
