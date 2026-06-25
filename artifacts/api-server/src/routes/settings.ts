import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { systemSettingsTable, mallSitesTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { requireAuth, requireAnyRole } from "../middlewares/auth";
import { invalidateBaseUrlCache } from "../lib/app-url";
import { getSiteCompanyName, clearCompanyNameCache } from "../lib/whatsapp";

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
// Ambil daftar semua site beserta companyName dan logoUrl (owner/admin/finance)
router.get("/settings/sites", requireAuth, requireAnyRole("owner", "admin", "finance"), async (_req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT id AS "siteId", name AS "siteName", company_name AS "companyName", logo_url AS "logoUrl"
      FROM mall_sites
      WHERE code NOT LIKE 'KANTIN%'
      ORDER BY id ASC
    `);
    const data = (rows as unknown as { rows: { siteId: number; siteName: string; companyName: string | null; logoUrl: string | null }[] }).rows;
    res.json(data.map(r => ({
      siteId: r.siteId,
      siteName: r.siteName,
      companyName: r.companyName ?? "",
      logoUrl: r.logoUrl ?? "",
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
    // logoUrl boleh string kosong (hapus logo) atau URL valid
    if (rawUrl !== "" && typeof rawUrl === "string" && rawUrl.length > 0) {
      const isValid =
        rawUrl.startsWith("/uploads/") ||
        rawUrl.startsWith("https://") ||
        rawUrl.startsWith("http://");
      if (!isValid) {
        res.status(400).json({ error: "logoUrl tidak valid" });
        return;
      }
    }

    const logoUrl = typeof rawUrl === "string" ? rawUrl.trim() : "";

    await db
      .update(mallSitesTable)
      .set({ logoUrl: logoUrl || null, updatedAt: new Date() })
      .where(eq(mallSitesTable.id, siteId));

    res.json({ success: true, siteId, logoUrl });
  } catch {
    res.status(500).json({ error: "Gagal menyimpan logo site" });
  }
});

export default router;
