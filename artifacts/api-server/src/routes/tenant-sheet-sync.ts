import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { tenantsTable, systemSettingsTable } from "@workspace/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { requireAnyRole } from "../middlewares/auth";
import { readFromSheet, writeToSheet, extractSheetId, getServiceAccountEmail } from "../services/google-sheets";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const TENANT_SYNC_CONFIG_KEY = "tenant_sheet_sync_config";

const SHEET_TITLE = "Data Tenant";

const HEADERS = [
  "Nama Usaha",
  "Nama Pemilik",
  "No HP",
  "Email",
  "Kategori",
  "Nomor Booth",
  "Area",
  "Status",
  "Sewa Default (Rp)",
  "Service Charge (Rp)",
  "Listrik (Rp)",
  "Air (Rp)",
  "Biaya Lain (Rp)",
  "Sampah (Rp)",
  "Mulai Kontrak",
  "Akhir Kontrak",
  "Catatan",
];

type ParsedTenantRow = {
  businessName: string;
  ownerName: string;
  phone: string | null;
  email: string | null;
  category: string | null;
  boothNumber: string | null;
  areaName: string;
  status: string;
  defaultRentAmount: string;
  defaultServiceChargeAmount: string;
  defaultElectricityChargeAmount: string;
  defaultWaterChargeAmount: string;
  defaultOtherChargeAmount: string;
  defaultTrashChargeAmount: string;
  contractStartDate: string | null;
  contractEndDate: string | null;
  notes: string | null;
};

function parseRows(rows: string[][]): ParsedTenantRow[] {
  if (rows.length < 2) return [];

  const header = rows[0].map((h) => (h ?? "").trim().toLowerCase());
  const idx = (...candidates: string[]) =>
    candidates.map((c) => header.indexOf(c)).find((i) => i >= 0) ?? -1;

  const nameIdx       = idx("nama usaha", "business_name", "nama_usaha", "usaha", "nama bisnis");
  const ownerIdx      = idx("nama pemilik", "owner_name", "pemilik", "nama_pemilik");
  const phoneIdx      = idx("no hp", "phone", "no. hp", "telepon", "no_hp");
  const emailIdx      = idx("email");
  const catIdx        = idx("kategori", "category");
  const boothIdx      = idx("nomor booth", "booth", "nomor_booth", "no booth", "no. booth");
  const areaIdx       = idx("area", "area_name", "lokasi");
  const statusIdx     = idx("status");
  const rentIdx       = idx("sewa default (rp)", "sewa", "rent", "sewa default", "default_rent_amount");
  const svcIdx        = idx("service charge (rp)", "service charge", "service_charge");
  const elecIdx       = idx("listrik (rp)", "listrik", "electricity");
  const waterIdx      = idx("air (rp)", "air", "water");
  const otherIdx      = idx("biaya lain (rp)", "biaya lain", "other");
  const trashIdx      = idx("sampah (rp)", "sampah", "trash");
  const startIdx      = idx("mulai kontrak", "contract_start_date", "start_date", "tgl mulai");
  const endIdx        = idx("akhir kontrak", "contract_end_date", "end_date", "tgl akhir", "tgl berakhir");
  const notesIdx      = idx("catatan", "notes", "keterangan");

  const raw = (row: string[], i: number) => (i >= 0 ? (row[i] ?? "").trim() : "");
  const num = (s: string) => {
    const n = parseFloat(s.replace(/[^0-9.]/g, ""));
    return isNaN(n) ? "0" : String(n);
  };
  const maybeDate = (s: string): string | null => {
    if (!s) return null;
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    return null;
  };

  return rows.slice(1).flatMap((row) => {
    const businessName = raw(row, nameIdx);
    const ownerName    = raw(row, ownerIdx);
    if (!businessName || !ownerName) return [];

    return [{
      businessName,
      ownerName,
      phone:                        raw(row, phoneIdx) || null,
      email:                        raw(row, emailIdx) || null,
      category:                     raw(row, catIdx) || null,
      boothNumber:                  raw(row, boothIdx) || null,
      areaName:                     raw(row, areaIdx) || "",
      status:                       raw(row, statusIdx) || "active",
      defaultRentAmount:            num(raw(row, rentIdx)),
      defaultServiceChargeAmount:   num(raw(row, svcIdx)),
      defaultElectricityChargeAmount: num(raw(row, elecIdx)),
      defaultWaterChargeAmount:     num(raw(row, waterIdx)),
      defaultOtherChargeAmount:     num(raw(row, otherIdx)),
      defaultTrashChargeAmount:     num(raw(row, trashIdx)),
      contractStartDate:            maybeDate(raw(row, startIdx)),
      contractEndDate:              maybeDate(raw(row, endIdx)),
      notes:                        raw(row, notesIdx) || null,
    }];
  });
}

router.get("/tenant-sheet-sync/info", requireAnyRole("owner", "admin"), async (_req, res) => {
  try {
    res.json({ serviceAccountEmail: getServiceAccountEmail() });
  } catch (err) {
    res.status(500).json({ error: "Gagal mengambil info service account" });
  }
});

router.get("/tenant-sheet-sync/config", requireAnyRole("owner", "admin"), async (req, res) => {
  try {
    const siteId = req.siteId;
    const configKey = siteId > 0 ? `${TENANT_SYNC_CONFIG_KEY}_site_${siteId}` : TENANT_SYNC_CONFIG_KEY;
    const rows = await db
      .select({ value: systemSettingsTable.value })
      .from(systemSettingsTable)
      .where(eq(systemSettingsTable.key, configKey))
      .limit(1);
    res.json(rows[0]?.value ?? { enabled: false, spreadsheetId: "", sheetName: "", intervalMinutes: 30 });
  } catch (err) {
    req.log.error(err, "Gagal mengambil config tenant sheet sync");
    res.status(500).json({ error: "Gagal mengambil konfigurasi" });
  }
});

router.post("/tenant-sheet-sync/config", requireAnyRole("owner", "admin"), async (req, res) => {
  try {
    const siteId = req.siteId;
    const configKey = siteId > 0 ? `${TENANT_SYNC_CONFIG_KEY}_site_${siteId}` : TENANT_SYNC_CONFIG_KEY;
    const { enabled, spreadsheetId, sheetName, intervalMinutes } = req.body as {
      enabled: boolean;
      spreadsheetId: string;
      sheetName?: string;
      intervalMinutes?: number;
    };

    const newValue = {
      enabled: !!enabled,
      spreadsheetId: spreadsheetId?.trim() ?? "",
      sheetName: sheetName?.trim() ?? "",
      intervalMinutes: Number(intervalMinutes ?? 30),
      updatedAt: new Date().toISOString(),
    };

    const existing = await db
      .select({ key: systemSettingsTable.key })
      .from(systemSettingsTable)
      .where(eq(systemSettingsTable.key, configKey))
      .limit(1);

    if (existing.length > 0) {
      await db.update(systemSettingsTable)
        .set({ value: newValue, updatedAt: new Date() })
        .where(eq(systemSettingsTable.key, configKey));
    } else {
      await db.insert(systemSettingsTable).values({
        key: configKey,
        value: newValue,
        siteId: siteId > 0 ? siteId : null,
        label: "Konfigurasi Sinkronisasi Tenant dari Google Sheets",
        description: "Auto-sync data tenant dari Google Sheets ke database",
        type: "json",
      });
    }

    res.json({ success: true });
  } catch (err) {
    req.log.error(err, "Gagal menyimpan config tenant sheet sync");
    res.status(500).json({ error: "Gagal menyimpan konfigurasi" });
  }
});

router.post("/tenant-sheet-sync/preview", requireAnyRole("owner", "admin"), async (req, res) => {
  try {
    const { spreadsheetId: rawId, sheetName } = req.body as { spreadsheetId: string; sheetName?: string };
    if (!rawId) { res.status(400).json({ error: "spreadsheetId wajib diisi" }); return; }

    const spreadsheetId = extractSheetId(rawId);
    const range = sheetName ? `'${sheetName}'!A:Z` : "A:Z";
    const rows = await readFromSheet({ spreadsheetId, range });

    if (!rows || rows.length < 2) {
      res.json({ tenants: [], totalRows: 0, message: "Sheet kosong atau tidak ada data" });
      return;
    }

    const parsed = parseRows(rows);

    const siteId = req.siteId;
    const existingTenants = await db
      .select({ businessName: tenantsTable.businessName, ownerName: tenantsTable.ownerName, id: tenantsTable.id })
      .from(tenantsTable)
      .where(siteId > 0 ? eq(tenantsTable.siteId, siteId) : undefined);

    const existingKeys = new Set(existingTenants.map((t) => `${t.businessName}|${t.ownerName}`.toLowerCase()));

    const preview = parsed.map((t) => ({
      ...t,
      isNew: !existingKeys.has(`${t.businessName}|${t.ownerName}`.toLowerCase()),
    }));

    res.json({ tenants: preview, totalRows: parsed.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ err }, "[tenant-sheet-sync] Preview gagal");
    res.status(500).json({ error: `Gagal membaca sheet: ${msg}` });
  }
});

router.post("/tenant-sheet-sync/import", requireAnyRole("owner", "admin"), async (req, res) => {
  try {
    const { spreadsheetId: rawId, sheetName, mode = "upsert" } = req.body as {
      spreadsheetId: string;
      sheetName?: string;
      mode?: "upsert" | "insert_only";
    };
    if (!rawId) { res.status(400).json({ error: "spreadsheetId wajib diisi" }); return; }

    const spreadsheetId = extractSheetId(rawId);
    const range = sheetName ? `'${sheetName}'!A:Z` : "A:Z";
    const rows = await readFromSheet({ spreadsheetId, range });

    if (!rows || rows.length < 2) {
      res.json({ inserted: 0, updated: 0, skipped: 0, totalRows: 0 });
      return;
    }

    const parsed = parseRows(rows);
    if (parsed.length === 0) {
      res.json({ inserted: 0, updated: 0, skipped: 0, totalRows: 0 });
      return;
    }

    const siteId = req.siteId;
    const existingTenants = await db
      .select({ id: tenantsTable.id, businessName: tenantsTable.businessName, ownerName: tenantsTable.ownerName })
      .from(tenantsTable)
      .where(siteId > 0 ? eq(tenantsTable.siteId, siteId) : undefined);

    const existingMap = new Map(existingTenants.map((t) => [`${t.businessName}|${t.ownerName}`.toLowerCase(), t.id]));

    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const t of parsed) {
      const key = `${t.businessName}|${t.ownerName}`.toLowerCase();
      const existingId = existingMap.get(key);

      if (existingId) {
        if (mode === "insert_only") { skipped++; continue; }
        await db.update(tenantsTable)
          .set({
            phone: t.phone,
            email: t.email,
            category: t.category,
            boothNumber: t.boothNumber,
            areaName: t.areaName,
            status: t.status,
            defaultRentAmount: t.defaultRentAmount,
            defaultServiceChargeAmount: t.defaultServiceChargeAmount,
            defaultElectricityChargeAmount: t.defaultElectricityChargeAmount,
            defaultWaterChargeAmount: t.defaultWaterChargeAmount,
            defaultOtherChargeAmount: t.defaultOtherChargeAmount,
            defaultTrashChargeAmount: t.defaultTrashChargeAmount,
            contractStartDate: t.contractStartDate,
            contractEndDate: t.contractEndDate,
            notes: t.notes,
            updatedAt: new Date(),
          })
          .where(eq(tenantsTable.id, existingId));
        updated++;
      } else {
        await db.insert(tenantsTable).values({
          ...t,
          siteId: siteId > 0 ? siteId : null,
        });
        inserted++;
      }
    }

    logger.info({ inserted, updated, skipped, totalRows: parsed.length, siteId }, "[tenant-sheet-sync] Import selesai");
    res.json({ inserted, updated, skipped, totalRows: parsed.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ err }, "[tenant-sheet-sync] Import gagal");
    res.status(500).json({ error: `Gagal mengimpor data: ${msg}` });
  }
});

router.post("/tenant-sheet-sync/export", requireAnyRole("owner", "admin"), async (req, res) => {
  try {
    const { spreadsheetId: rawId, sheetTitle: customTitle } = req.body as {
      spreadsheetId: string;
      sheetTitle?: string;
    };
    if (!rawId) { res.status(400).json({ error: "spreadsheetId wajib diisi" }); return; }

    const spreadsheetId = extractSheetId(rawId);
    const siteId = req.siteId;
    const tenants = await db
      .select()
      .from(tenantsTable)
      .where(siteId > 0 ? eq(tenantsTable.siteId, siteId) : undefined);

    const rows: (string | number | null)[][] = tenants.map((t) => [
      t.businessName,
      t.ownerName,
      t.phone ?? "",
      t.email ?? "",
      t.category ?? "",
      t.boothNumber ?? "",
      t.areaName ?? "",
      t.status ?? "active",
      t.defaultRentAmount ? parseFloat(t.defaultRentAmount) : 0,
      t.defaultServiceChargeAmount ? parseFloat(t.defaultServiceChargeAmount) : 0,
      t.defaultElectricityChargeAmount ? parseFloat(t.defaultElectricityChargeAmount) : 0,
      t.defaultWaterChargeAmount ? parseFloat(t.defaultWaterChargeAmount) : 0,
      t.defaultOtherChargeAmount ? parseFloat(t.defaultOtherChargeAmount) : 0,
      t.defaultTrashChargeAmount ? parseFloat(t.defaultTrashChargeAmount) : 0,
      t.contractStartDate ?? "",
      t.contractEndDate ?? "",
      t.notes ?? "",
    ]);

    await writeToSheet({
      spreadsheetId,
      sheetTitle: customTitle?.trim() || SHEET_TITLE,
      headers: HEADERS,
      rows,
    });

    res.json({ success: true, exported: tenants.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ err }, "[tenant-sheet-sync] Export gagal");
    res.status(500).json({ error: `Gagal mengekspor data: ${msg}` });
  }
});

export default router;
