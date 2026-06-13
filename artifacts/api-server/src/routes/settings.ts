import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { systemSettingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth, requireAnyRole } from "../middlewares/auth";
import { invalidateBaseUrlCache } from "../lib/app-url";

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
  // Nomor WA admin yang menerima notifikasi bukti bayar dari tenant.
  // Format: 08xxx atau 628xxx. Bisa di-override via env ADMIN_WHATSAPP.
  adminPhone: "",
  // Nomor HP pengirim WA (device Fonnte yang digunakan kirim ke tenant).
  // Isi dengan nomor HP yang sudah di-scan QR di Fonnte, format 628xxx.
  // Kosongkan untuk menggunakan device default akun Fonnte.
  waSenderPhone: "",
  // Nama/label device Fonnte (informasi saja, untuk identifikasi)
  waSenderLabel: "",
  // Domain publik untuk link pembayaran tenant (mis. https://tenant.travelintrips.co.id)
  // Jika diisi, menimpa env var APP_URL. Link bayar: {paymentDomain}/bayar/{token}
  paymentDomain: "",
};

router.get("/settings", requireAuth, requireAnyRole("owner", "admin", "finance"), async (_req, res) => {
  try {
    const [row] = await db
      .select()
      .from(systemSettingsTable)
      .where(eq(systemSettingsTable.key, SETTINGS_KEY));

    const value = (row?.value as Record<string, unknown>) ?? {};
    res.json({ ...DEFAULT_SETTINGS, ...value });
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
  } catch (err) {
    res.status(500).json({ error: "Gagal menyimpan pengaturan" });
  }
});

export default router;
