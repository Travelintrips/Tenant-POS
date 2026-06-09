import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { mallSitesTable, userSiteAccessTable, usersTable, insertMallSiteSchema } from "@workspace/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth, requireAnyRole } from "../middlewares/auth";
import { clearSitesCache } from "../middlewares/site-context";
import { logAudit } from "../lib/audit";

const router: IRouter = Router();

// ─── GET /api/sites — list all active sites (for site switcher) ──────────────
router.get("/sites", requireAuth, async (req, res) => {
  try {
    const user = req.user as { role?: string; dbId?: number } | undefined;
    const role = user?.role ?? "";

    // Owner and admin see all sites
    if (role === "owner" || role === "admin") {
      const rows = await db
        .select()
        .from(mallSitesTable)
        .orderBy(mallSitesTable.id);
      const SITE_ORDER: Record<string, number> = {
        SPORT_CENTER_BANDARA: 1,
        TOD_M1_BANDARA: 2,
      };
      rows.sort((a, b) => (SITE_ORDER[a.code] ?? 99) - (SITE_ORDER[b.code] ?? 99));
      res.json(rows);
      return;
    }

    // Others: see sites they have access to, plus the default site (TOD_M1_BANDARA)
    const numericDbId = user?.dbId ? Number(user.dbId) : NaN;
    if (user?.dbId && !isNaN(numericDbId)) {
      const access = await db
        .select({ siteId: userSiteAccessTable.siteId })
        .from(userSiteAccessTable)
        .where(eq(userSiteAccessTable.userId, numericDbId));

      if (access.length > 0) {
        const siteIds = access.map((a) => a.siteId);
        const allSites = await db.select().from(mallSitesTable).orderBy(mallSitesTable.id);
        const allowed = allSites.filter((s) => siteIds.includes(s.id));
        res.json(allowed);
        return;
      }
    }

    // Fallback: return default site only
    const defaultSite = await db
      .select()
      .from(mallSitesTable)
      .where(eq(mallSitesTable.code, "TOD_M1_BANDARA"));
    res.json(defaultSite);
  } catch (err) {
    req.log.error(err, "Failed to list sites");
    res.status(500).json({ error: "Gagal mengambil daftar site" });
  }
});

// ─── POST /api/sites — create new site (owner only) ─────────────────────────
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

// ─── PUT /api/sites/:id — update site (owner only) ──────────────────────────
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

// ─── GET /api/sites/:id/users — list users with access to site ───────────────
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

// ─── POST /api/sites/:id/users — grant user access to site ───────────────────
router.post("/sites/:id/users", requireAnyRole("owner", "admin"), async (req, res) => {
  const siteId = Number(req.params.id);
  if (isNaN(siteId)) { res.status(400).json({ error: "ID tidak valid" }); return; }
  const { userId, role } = req.body as { userId?: number; role?: string };
  if (!userId) { res.status(400).json({ error: "userId wajib diisi" }); return; }
  try {
    const [existing] = await db
      .select()
      .from(userSiteAccessTable)
      .where(and(eq(userSiteAccessTable.userId, userId), eq(userSiteAccessTable.siteId, siteId)));
    if (existing) {
      res.status(409).json({ error: "Pengguna sudah memiliki akses ke site ini" });
      return;
    }
    const [access] = await db
      .insert(userSiteAccessTable)
      .values({ userId, siteId, role: role ?? "admin" })
      .returning();
    logAudit(req, { action: "grant_site_access", entityType: "user_site_access", entityId: access.id, afterData: access });
    res.status(201).json(access);
  } catch (err) {
    req.log.error(err, "Failed to grant site access");
    res.status(500).json({ error: "Gagal memberikan akses site" });
  }
});

// ─── DELETE /api/sites/:id/users/:userId — revoke access ─────────────────────
router.delete("/sites/:id/users/:userId", requireAnyRole("owner", "admin"), async (req, res) => {
  const siteId = Number(req.params.id);
  const userId = Number(req.params.userId);
  if (isNaN(siteId) || isNaN(userId)) { res.status(400).json({ error: "ID tidak valid" }); return; }
  try {
    const [deleted] = await db
      .delete(userSiteAccessTable)
      .where(and(eq(userSiteAccessTable.userId, userId), eq(userSiteAccessTable.siteId, siteId)))
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
