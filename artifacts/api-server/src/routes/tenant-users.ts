import { Router, type IRouter } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import {
  usersTable,
  tenantUserAccessTable,
  tenantsTable,
  mallSitesTable,
} from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAnyRole } from "../middlewares/auth";
import { logAudit } from "../lib/audit";
import { normalizePhoneNumber } from "../services/otp-service";

const router: IRouter = Router();

const createTenantUserSchema = z.object({
  name: z.string().min(1),
  phoneNumber: z.string().min(8).max(20),
  accessLevel: z.enum(["owner", "staff", "viewer"]).default("viewer"),
  siteId: z.number().int().positive(),
});

const updateTenantUserSchema = z.object({
  name: z.string().min(1).optional(),
  accessLevel: z.enum(["owner", "staff", "viewer"]).optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

router.get(
  "/tenants/:tenantId/users",
  requireAnyRole("owner", "admin", "finance"),
  async (req, res) => {
    const tenantId = Number(req.params.tenantId);
    if (isNaN(tenantId)) {
      res.status(400).json({ error: "ID tenant tidak valid" });
      return;
    }

    const rows = await db
      .select({
        accessId: tenantUserAccessTable.id,
        userId: usersTable.id,
        name: usersTable.name,
        phoneNumber: usersTable.phoneNumber,
        email: usersTable.email,
        userStatus: usersTable.status,
        accessLevel: tenantUserAccessTable.accessLevel,
        accessStatus: tenantUserAccessTable.status,
        siteId: tenantUserAccessTable.siteId,
        siteName: mallSitesTable.name,
        createdAt: tenantUserAccessTable.createdAt,
      })
      .from(tenantUserAccessTable)
      .innerJoin(usersTable, eq(tenantUserAccessTable.userId, usersTable.id))
      .innerJoin(mallSitesTable, eq(tenantUserAccessTable.siteId, mallSitesTable.id))
      .where(eq(tenantUserAccessTable.tenantId, tenantId));

    res.json(rows);
  },
);

router.post(
  "/tenants/:tenantId/users",
  requireAnyRole("owner", "admin"),
  async (req, res) => {
    const tenantId = Number(req.params.tenantId);
    if (isNaN(tenantId)) {
      res.status(400).json({ error: "ID tenant tidak valid" });
      return;
    }

    const parsed = createTenantUserSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Data tidak valid", details: parsed.error.flatten() });
      return;
    }

    const { name, phoneNumber, accessLevel, siteId } = parsed.data;
    const normalizedPhone = normalizePhoneNumber(phoneNumber);

    const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, tenantId));
    if (!tenant) {
      res.status(404).json({ error: "Tenant tidak ditemukan" });
      return;
    }

    let [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.phoneNumber, normalizedPhone));

    if (!user) {
      const { randomUUID } = await import("node:crypto");
      const [created] = await db
        .insert(usersTable)
        .values({ id: randomUUID(), name, phoneNumber: normalizedPhone, role: "tenant_user", status: "active" })
        .returning();
      user = created;
      logAudit(req, {
        action: "tenant_user_created",
        entityType: "user",
        entityId: user.id,
        afterData: { name, phoneNumber: normalizedPhone, tenantId, accessLevel },
      });
    }

    const [existingAccess] = await db
      .select()
      .from(tenantUserAccessTable)
      .where(
        and(
          eq(tenantUserAccessTable.userId, user.id),
          eq(tenantUserAccessTable.tenantId, tenantId),
          eq(tenantUserAccessTable.siteId, siteId),
        ),
      );

    if (existingAccess) {
      const [updated] = await db
        .update(tenantUserAccessTable)
        .set({ accessLevel, status: "active", updatedAt: new Date() })
        .where(eq(tenantUserAccessTable.id, existingAccess.id))
        .returning();
      res.json({ user, access: updated });
      return;
    }

    const [access] = await db
      .insert(tenantUserAccessTable)
      .values({ userId: user.id, tenantId, siteId, accessLevel, status: "active" })
      .returning();

    res.status(201).json({ user, access });
  },
);

router.patch(
  "/tenants/:tenantId/users/:userId",
  requireAnyRole("owner", "admin"),
  async (req, res) => {
    const tenantId = Number(req.params.tenantId);
    const userId = String(req.params.userId);
    if (isNaN(tenantId) || !userId) {
      res.status(400).json({ error: "ID tidak valid" });
      return;
    }

    const parsed = updateTenantUserSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Data tidak valid", details: parsed.error.flatten() });
      return;
    }

    const { name, accessLevel, status } = parsed.data;

    if (name !== undefined) {
      await db
        .update(usersTable)
        .set({ name, updatedAt: new Date() })
        .where(eq(usersTable.id, userId));
    }

    const accessUpdates: Partial<{ accessLevel: string; status: string; updatedAt: Date }> = {};
    if (accessLevel !== undefined) accessUpdates.accessLevel = accessLevel;
    if (status !== undefined) {
      accessUpdates.status = status;
      if (status === "inactive") {
        logAudit(req, {
          action: "tenant_user_deactivated",
          entityType: "user",
          afterData: { tenantId, userId, status },
        });
      }
    }
    accessUpdates.updatedAt = new Date();

    const [updated] = await db
      .update(tenantUserAccessTable)
      .set(accessUpdates)
      .where(
        and(
          eq(tenantUserAccessTable.userId, userId),
          eq(tenantUserAccessTable.tenantId, tenantId),
        ),
      )
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Akses tidak ditemukan" });
      return;
    }

    res.json(updated);
  },
);

router.delete(
  "/tenants/:tenantId/users/:userId",
  requireAnyRole("owner", "admin"),
  async (req, res) => {
    const tenantId = Number(req.params.tenantId);
    const userId = String(req.params.userId);
    if (isNaN(tenantId) || !userId) {
      res.status(400).json({ error: "ID tidak valid" });
      return;
    }

    const [updated] = await db
      .update(tenantUserAccessTable)
      .set({ status: "inactive", updatedAt: new Date() })
      .where(
        and(
          eq(tenantUserAccessTable.userId, userId),
          eq(tenantUserAccessTable.tenantId, tenantId),
        ),
      )
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Akses tidak ditemukan" });
      return;
    }

    logAudit(req, {
      action: "tenant_user_deactivated",
      entityType: "user",
      afterData: { tenantId, userId, status: "inactive" },
    });

    res.json({ ok: true });
  },
);

export default router;
