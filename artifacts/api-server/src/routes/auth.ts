import { Router, type IRouter } from "express";
import passport from "../lib/auth";
import { db } from "@workspace/db";
import { usersTable, USER_ROLES, type UserRole, tenantUserAccessTable, mallSitesTable, tenantsTable } from "@workspace/db/schema";
import { eq, asc, and } from "drizzle-orm";
import { findOrCreateUser, buildSessionUser, getTenantAccess } from "../lib/auth";
import { requireAnyRole, requireAuth } from "../middlewares/auth";
import { logAudit } from "../lib/audit";
import { logger } from "../lib/logger";
import { devLoginRateLimiter, googleAuthRateLimiter, authMeRateLimiter } from "../middlewares/rate-limit";
import { normalizePhoneNumber } from "../services/otp-service";

const router: IRouter = Router();

const DEV_LOGIN_ENABLED =
  process.env.NODE_ENV !== "production" ||
  process.env.ENABLE_DEV_LOGIN === "true";

const DEV_ROLE_EMAILS: Record<string, { email: string; name: string }> = {
  owner:   { email: "owner@mall.local",   name: "Dev Owner" },
  admin:   { email: "admin@mall.local",   name: "Dev Admin" },
  finance: { email: "finance@mall.local", name: "Dev Finance" },
  cashier: { email: "cashier@mall.local", name: "Dev Kasir" },
};

if (DEV_LOGIN_ENABLED) {
  router.post("/auth/dev-login", devLoginRateLimiter, async (req, res) => {
    const { role } = req.body as { role?: string; email?: string; name?: string };

    const effectiveRole: UserRole = (USER_ROLES.includes(role as UserRole) ? role : "admin") as UserRole;

    if (effectiveRole === "tenant_user") {
      const phoneNumber = (req.body as any).phoneNumber as string | undefined;
      const normalized = normalizePhoneNumber(phoneNumber ?? "628000000001");
      const name = (req.body as any).name ?? "Dev Tenant User";

      let [existing] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.phoneNumber, normalized));

      if (!existing) {
        const [created] = await db
          .insert(usersTable)
          .values({ name, phoneNumber: normalized, role: "tenant_user", status: "active" })
          .returning();
        existing = created;

        const [site] = await db.select().from(mallSitesTable).limit(1);
        const [tenant] = await db.select().from(tenantsTable).limit(1);
        if (site && tenant) {
          await db
            .insert(tenantUserAccessTable)
            .values({ userId: existing.id, tenantId: tenant.id, siteId: site.id, accessLevel: "viewer", status: "active" })
            .onConflictDoNothing();
        }
      }

      const sessionUser = await buildSessionUser({ ...existing, phoneNumber: existing.phoneNumber ?? null });
      req.login(sessionUser, (err) => {
        if (err) { res.status(500).json({ error: "Login gagal" }); return; }
        res.json(sessionUser);
      });
      return;
    }

    const preset = DEV_ROLE_EMAILS[effectiveRole] ?? {
      email: req.body.email ?? `dev-${effectiveRole}@mall.local`,
      name: req.body.name ?? `Dev ${effectiveRole}`,
    };

    logger.info({ role: effectiveRole, email: preset.email }, "[dev-login] dipanggil");

    try {
      const dbUser = await findOrCreateUser({
        email: preset.email,
        name: preset.name,
        avatar: null,
      });

      if (dbUser.role !== effectiveRole) {
        await db
          .update(usersTable)
          .set({ role: effectiveRole, updatedAt: new Date() })
          .where(eq(usersTable.id, dbUser.id));
        dbUser.role = effectiveRole;
      }

      const sessionUser = await buildSessionUser(dbUser, `dev:${preset.email}`);

      logger.info({ role: sessionUser.role, email: sessionUser.email }, "[dev-login] user siap, memanggil req.login");

      req.login(sessionUser, (err) => {
        if (err) {
          logger.error({ err }, "[dev-login] req.login gagal");
          res.status(500).json({ error: "Login gagal" });
          return;
        }
        logger.info({ role: sessionUser.role }, "[dev-login] req.login berhasil");
        logAudit(req, {
          action: "dev_login",
          entityType: "user",
          entityId: dbUser.id,
          afterData: { email: sessionUser.email, role: sessionUser.role, method: "dev-login" },
        });
        res.json(sessionUser);
      });
    } catch (err) {
      logger.error({ err }, "[dev-login] Error membuat user");
      res.status(500).json({ error: "Gagal membuat sesi dev login" });
    }
  });
}

router.get("/auth/dev-login-enabled", (_req, res) => {
  res.json({ enabled: DEV_LOGIN_ENABLED });
});

router.get("/auth/google", googleAuthRateLimiter, passport.authenticate("google", { scope: ["profile", "email"] }));

router.get(
  "/auth/google/callback",
  googleAuthRateLimiter,
  passport.authenticate("google", { failureRedirect: "/login?error=1" }),
  (_req, res) => {
    res.redirect("/");
  },
);

router.get("/auth/me", authMeRateLimiter, async (req, res) => {
  logger.info({ isAuthenticated: req.isAuthenticated(), hasUser: !!req.user }, "[auth/me] dipanggil");
  if (!req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: "Tidak terautentikasi" });
    return;
  }
  const user = req.user;

  let tenantAccess = user.tenantAccess;
  if (user.role === "tenant_user" && !tenantAccess) {
    tenantAccess = await getTenantAccess(user.dbId);
  }

  res.json({
    id: user.id,
    dbId: user.dbId,
    email: user.email ?? null,
    name: user.name,
    phoneNumber: user.phoneNumber ?? null,
    avatar: user.avatar,
    role: user.role,
    allowedSites: user.allowedSites ?? [],
    ...(user.role === "tenant_user" ? { tenantAccess: tenantAccess ?? [] } : {}),
  });
});

router.post("/auth/logout", (req, res) => {
  req.logout(() => {
    res.json({ ok: true });
  });
});

router.get("/users", requireAuth, requireAnyRole("owner", "admin"), async (_req, res) => {
  try {
    const users = await db
      .select({
        id: usersTable.id,
        email: usersTable.email,
        name: usersTable.name,
        role: usersTable.role,
        phoneNumber: usersTable.phoneNumber,
        status: usersTable.status,
        avatarUrl: usersTable.avatarUrl,
        createdAt: usersTable.createdAt,
        updatedAt: usersTable.updatedAt,
      })
      .from(usersTable)
      .orderBy(asc(usersTable.createdAt));
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: "Gagal mengambil daftar user" });
  }
});

router.patch("/users/:id/role", requireAuth, requireAnyRole("owner"), async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "ID tidak valid" });
    return;
  }

  const { role } = req.body as { role?: string };
  if (!role || !USER_ROLES.includes(role as UserRole)) {
    res.status(400).json({ error: `Peran tidak valid. Pilihan: ${USER_ROLES.join(", ")}` });
    return;
  }

  try {
    const [before] = await db
      .select({ id: usersTable.id, email: usersTable.email, name: usersTable.name, role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.id, id));

    if (!before) {
      res.status(404).json({ error: "User tidak ditemukan" });
      return;
    }

    const [updated] = await db
      .update(usersTable)
      .set({ role: role as UserRole, updatedAt: new Date() })
      .where(eq(usersTable.id, id))
      .returning({
        id: usersTable.id,
        email: usersTable.email,
        name: usersTable.name,
        role: usersTable.role,
        updatedAt: usersTable.updatedAt,
      });

    logAudit(req, {
      action: "change_user_role",
      entityType: "user",
      entityId: id,
      beforeData: { id: before.id, email: before.email, name: before.name, role: before.role },
      afterData: { id: updated.id, email: updated.email, name: updated.name, role: updated.role },
    });

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Gagal mengubah peran user" });
  }
});

export default router;
