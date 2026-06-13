import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { mallSitesTable, userSiteAccessTable, usersTable, insertMallSiteSchema } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireAnyRole } from "../middlewares/auth";
import { clearSitesCache } from "../middlewares/site-context";
import { logAudit } from "../lib/audit";

const router: IRouter = Router();

// Urutan tampilan site (site utama selalu duluan)
const SITE_ORDER: Record<string, number> = {
  SPORT_CENTER_BANDARA: 1,
  TOD_M1_BANDARA: 2,
};

function sortSites<T extends { code: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => (SITE_ORDER[a.code] ?? 99) - (SITE_ORDER[b.code] ?? 99));
}

// ─── GET /api/sites ───────────────────────────────────────────────────────────
// Hanya mengembalikan site AKTIF.
// ?includeInactive=true (owner/admin only) mengembalikan semua site.
router.get("/sites", requireAuth, async (req, res) => {
  try {
    const user = req.user as { role?: string; dbId?: number } | undefined;
    const role = user?.role ?? "";
    const includeInactive = req.query.includeInactive === "true" && (role === "owner" || role === "admin");

    // Owner & admin: semua site (filtered by status unless includeInactive)
    if (role === "owner" || role === "admin") {
      const allSites = await db.select().from(mallSitesTable);
      const filtered = includeInactive ? allSites : allSites.filter((s) => s.status === "active");
      res.json(sortSites(filtered));
      return;
    }

    // Roles lain: hanya site aktif yang user punya akses
    const numericDbId = user?.dbId ? Number(user.dbId) : NaN;
    if (user?.dbId && !isNaN(numericDbId)) {
      const access = await db
        .select({ siteId: userSiteAccessTable.siteId })
        .from(userSiteAccessTable)
        .where(eq(userSiteAccessTable.userId, String(numericDbId)));

      if (access.length > 0) {
        const siteIds = access.map((a) => a.siteId);
        const allSites = await db.select().from(mallSitesTable);
        const allowed = allSites.filter((s) => siteIds.includes(s.id) && s.status === "active");
        res.json(sortSites(allowed));
        return;
      }
    }

    // Fallback: site default aktif
    const defaultSite = await db
      .select()
      .from(mallSitesTable)
      .where(and(eq(mallSitesTable.code, "TOD_M1_BANDARA"), eq(mallSitesTable.status, "active")));
    res.json(defaultSite);
  } catch (err) {
    req.log.error(err, "Failed to list sites");
    res.status(500).json({ error: "Gagal mengambil daftar site" });
  }
});

// ─── POST /api/sites — buat site baru (owner only) ───────────────────────────
router.post("/sites", requireAnyRole("owner"), async (req, res) => {
  const parsed = insertMallSiteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const [site] = await db.insert(mallSitesTable).values(parsed.data).returning();
    clearSitesCache();
    logAudit(req, { action: "create_site", entityType: "site", entityId: site.id, afterData: site });
    res.status(201).json(site);
  } catch (err) {
    req.log.error(err, "Failed to create site");
    res.status(500).json({ error: "Gagal membuat site" });
  }
});

// ─── PUT /api/sites/:id — update site (owner only) ───────────────────────────
router.put("/sites/:id", requireAnyRole("owner"), async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid" }); return; }
  const parsed = insertMallSiteSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try {
    const [before] = await db.select().from(mallSitesTable).where(eq(mallSitesTable.id, id));
    const [site] = await db.update(mallSitesTable).set({ ...parsed.data, updatedAt: new Date() }).where(eq(mallSitesTable.id, id)).returning();
    if (!site) { res.status(404).json({ error: "Site tidak ditemukan" }); return; }
    clearSitesCache();
    logAudit(req, { action: "update_site", entityType: "site", entityId: id, beforeData: before, afterData: site });
    res.json(site);
  } catch (err) {
    req.log.error(err, "Failed to update site");
    res.status(500).json({ error: "Gagal memperbarui site" });
  }
});

// ─── GET /api/sites/:id/users ─────────────────────────────────────────────────
router.get("/sites/:id/users", requireAnyRole("owner", "admin"), async (req, res) => {
  const siteId = Number(req.params.id);
  if (isNaN(siteId)) { res.status(400).json({ error: "ID tidak valid" }); return; }
  try {
    const rows = await db
      .select({
        id: userSiteAccessTable.id,
        userId: userSiteAccessTable.userId,
        siteId: userSiteAccessTable.siteId,
        role: userSiteAccessTable.role,
        userEmail: usersTable.email,
        userName: usersTable.name,
        userRole: usersTable.role,
        createdAt: userSiteAccessTable.createdAt,
      })
      .from(userSiteAccessTable)
      .leftJoin(usersTable, eq(userSiteAccessTable.userId, usersTable.id))
      .where(eq(userSiteAccessTable.siteId, siteId));
    res.json(rows);
  } catch (err) {
    req.log.error(err, "Failed to list site users");
    res.status(500).json({ error: "Gagal mengambil pengguna site" });
  }
});

// ─── POST /api/sites/:id/users — beri akses user ke site ─────────────────────
router.post("/sites/:id/users", requireAnyRole("owner", "admin"), async (req, res) => {
  const siteId = Number(req.params.id);
  if (isNaN(siteId)) { res.status(400).json({ error: "ID tidak valid" }); return; }
  const { userId, role } = req.body as { userId?: number; role?: string };
  if (!userId) { res.status(400).json({ error: "userId wajib diisi" }); return; }
  try {
    const [existing] = await db
      .select()
      .from(userSiteAccessTable)
      .where(and(eq(userSiteAccessTable.userId, String(userId)), eq(userSiteAccessTable.siteId, siteId)));
    if (existing) {
      res.status(409).json({ error: "Pengguna sudah memiliki akses ke site ini" });
      return;
    }
    const [access] = await db
      .insert(userSiteAccessTable)
      .values({ userId: String(userId), siteId, role: role ?? "admin" })
      .returning();
    logAudit(req, { action: "grant_site_access", entityType: "user_site_access", entityId: access.id, afterData: access });
    res.status(201).json(access);
  } catch (err) {
    req.log.error(err, "Failed to grant site access");
    res.status(500).json({ error: "Gagal memberikan akses site" });
  }
});

// ─── DELETE /api/sites/:id/users/:userId — cabut akses ───────────────────────
router.delete("/sites/:id/users/:userId", requireAnyRole("owner", "admin"), async (req, res) => {
  const siteId = Number(req.params.id);
  const userId = Number(req.params.userId);
  if (isNaN(siteId) || isNaN(userId)) { res.status(400).json({ error: "ID tidak valid" }); return; }
  try {
    const [deleted] = await db
      .delete(userSiteAccessTable)
      .where(and(eq(userSiteAccessTable.userId, String(userId)), eq(userSiteAccessTable.siteId, siteId)))
      .returning();
    if (!deleted) { res.status(404).json({ error: "Akses tidak ditemukan" }); return; }
    logAudit(req, { action: "revoke_site_access", entityType: "user_site_access", entityId: deleted.id, beforeData: deleted });
    res.json({ success: true });
  } catch (err) {
    req.log.error(err, "Failed to revoke site access");
    res.status(500).json({ error: "Gagal mencabut akses site" });
  }
});

export default router;
