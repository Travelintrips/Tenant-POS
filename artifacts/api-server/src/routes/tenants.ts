import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { tenantsTable, insertTenantSchema } from "@workspace/db/schema";
import { eq, asc, and } from "drizzle-orm";
import { requireAnyRole } from "../middlewares/auth";
import { logAudit } from "../lib/audit";

const router: IRouter = Router();

router.use("/tenants", requireAnyRole("owner", "admin"));

router.get("/tenants", async (req, res) => {
  try {
    const siteId = req.siteId;
    const conditions = siteId > 0 ? [eq(tenantsTable.siteId, siteId)] : [];
    const rows = await db
      .select()
      .from(tenantsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(tenantsTable.id));
    res.json(rows);
  } catch (err) {
    req.log.error(err, "Failed to list tenants");
    res.status(500).json({ error: "Gagal mengambil data tenant" });
  }
});

router.post("/tenants", async (req, res) => {
  const body = req.siteId > 0 ? { ...req.body, siteId: req.siteId } : req.body;
  const parsed = insertTenantSchema.safeParse(body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const [tenant] = await db
      .insert(tenantsTable)
      .values(parsed.data)
      .returning();
    logAudit(req, {
      action: "create_tenant",
      entityType: "tenant",
      entityId: tenant.id,
      afterData: tenant,
    });
    res.status(201).json(tenant);
  } catch (err) {
    req.log.error(err, "Failed to create tenant");
    res.status(500).json({ error: "Gagal membuat tenant" });
  }
});

router.get("/tenants/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "ID tidak valid" });
    return;
  }
  try {
    const [tenant] = await db
      .select()
      .from(tenantsTable)
      .where(eq(tenantsTable.id, id));
    if (!tenant) {
      res.status(404).json({ error: "Tenant tidak ditemukan" });
      return;
    }
    res.json(tenant);
  } catch (err) {
    req.log.error(err, "Failed to get tenant");
    res.status(500).json({ error: "Gagal mengambil tenant" });
  }
});

router.put("/tenants/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "ID tidak valid" });
    return;
  }
  const parsed = insertTenantSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const [before] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, id));
    const [tenant] = await db
      .update(tenantsTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(tenantsTable.id, id))
      .returning();
    if (!tenant) {
      res.status(404).json({ error: "Tenant tidak ditemukan" });
      return;
    }
    logAudit(req, {
      action: "update_tenant",
      entityType: "tenant",
      entityId: id,
      beforeData: before,
      afterData: tenant,
    });
    res.json(tenant);
  } catch (err) {
    req.log.error(err, "Failed to update tenant");
    res.status(500).json({ error: "Gagal memperbarui tenant" });
  }
});

router.delete("/tenants/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "ID tidak valid" });
    return;
  }
  try {
    const [deleted] = await db
      .delete(tenantsTable)
      .where(eq(tenantsTable.id, id))
      .returning();
    if (!deleted) {
      res.status(404).json({ error: "Tenant tidak ditemukan" });
      return;
    }
    logAudit(req, {
      action: "delete_tenant",
      entityType: "tenant",
      entityId: id,
      beforeData: deleted,
    });
    res.json({ ok: true, deleted });
  } catch (err) {
    req.log.error(err, "Failed to delete tenant");
    res.status(500).json({ error: "Gagal menghapus tenant" });
  }
});

export default router;
