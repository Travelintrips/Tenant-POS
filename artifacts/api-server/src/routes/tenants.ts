import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { tenantsTable, insertTenantSchema } from "@workspace/db/schema";
import { eq, asc } from "drizzle-orm";

const router: IRouter = Router();

router.get("/tenants", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(tenantsTable)
      .orderBy(asc(tenantsTable.id));
    res.json(rows);
  } catch (err) {
    req.log.error(err, "Failed to list tenants");
    res.status(500).json({ error: "Gagal mengambil data tenant" });
  }
});

router.post("/tenants", async (req, res) => {
  const parsed = insertTenantSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const [tenant] = await db
      .insert(tenantsTable)
      .values(parsed.data)
      .returning();
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
    const [tenant] = await db
      .update(tenantsTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(tenantsTable.id, id))
      .returning();
    if (!tenant) {
      res.status(404).json({ error: "Tenant tidak ditemukan" });
      return;
    }
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
    res.json({ success: true });
  } catch (err) {
    req.log.error(err, "Failed to delete tenant");
    res.status(500).json({ error: "Gagal menghapus tenant" });
  }
});

export default router;
