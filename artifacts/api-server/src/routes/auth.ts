import { Router, type IRouter } from "express";
import passport from "../lib/auth";
import { db } from "@workspace/db";
import { usersTable, USER_ROLES, USER_STATUSES, type UserRole, tenantUserAccessTable, mallSitesTable, tenantsTable } from "@workspace/db/schema";
import { eq, asc, and, ne, inArray } from "drizzle-orm";
import { findOrCreateUser, buildSessionUser, getTenantAccess } from "../lib/auth";
import { requireAnyRole, requireAuth, invalidateUserStatusCache } from "../middlewares/auth";
import { logAudit } from "../lib/audit";
import { logger } from "../lib/logger";
import { devLoginRateLimiter, googleAuthRateLimiter, authMeRateLimiter } from "../middlewares/rate-limit";
import { normalizePhoneNumber } from "../services/otp-service";
import { randomUUID } from "node:crypto";

const router: IRouter = Router();

const DEV_LOGIN_ENABLED =
  process.env.NODE_ENV !== "production" ||
  process.env.ENABLE_DEV_LOGIN === "true" ||
  Boolean(process.env.DEV_LOGIN_SECRET);
const IS_PRODUCTION = process.env.NODE_ENV === "production";

const DEV_PHONE_NUMBERS = [
 "6282299997227",
 "6287808785098"
]

const DEV_ROLE_NAMES: Record<string, string> = {
  owner: "Dev Owner",
  admin: "Dev Admin",
  finance: "Dev Finance",
  cashier: "Dev Kasir",
  tenant_user: "Dev Tenant User",
};

if (DEV_LOGIN_ENABLED) {
  router.post("/auth/dev-login", devLoginRateLimiter, async (req, res) => {
    const devLoginSecret = process.env.DEV_LOGIN_SECRET?.trim();

    if (IS_PRODUCTION && !devLoginSecret) {
      logger.error("[dev-login] DEV_LOGIN_SECRET belum dikonfigurasi di production");
      res.status(503).json({ error: "Login password belum dikonfigurasi di server" });
      return;
    }

    if (devLoginSecret) {
      const provided = (req.body as any).devSecret as string | undefined;

      if (!provided || provided !== devLoginSecret) {
        res.status(401).json({ error: "Password dev tidak valid" });
        return;
      }
    }

    const { role } = req.body as { role?: string };

    const effectiveRole: UserRole =
      USER_ROLES.includes(role as UserRole)
        ? role as UserRole
        : "admin";

    const phoneNumbers = DEV_PHONE_NUMBERS.map(normalizePhoneNumber);

    const requestedPhoneNumber = phoneNumbers[0];

    logger.info(
    { role: effectiveRole, phoneNumber: requestedPhoneNumber },
    "[dev-login] dipanggil"
    );

    try {
     let [dbUser] = await db
  .select({
    id: usersTable.id,
    email: usersTable.email,
    name: usersTable.name,
    avatarUrl: usersTable.avatarUrl,
    role: usersTable.role,
    phoneNumber: usersTable.phoneNumber,
  })
  .from(usersTable)
  .where(eq(usersTable.phoneNumber, requestedPhoneNumber));

if (!dbUser) {
  const [created] = await db
    .insert(usersTable)
    .values({
      id: randomUUID(),
      email: `${requestedPhoneNumber}@dev.local`,
      name: DEV_ROLE_NAMES[effectiveRole] ?? "Dev User",
      avatarUrl: null,
      phoneNumber: requestedPhoneNumber,
      role: effectiveRole,
      status: "active",
    })
    .returning({
      id: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      avatarUrl: usersTable.avatarUrl,
      role: usersTable.role,
      phoneNumber: usersTable.phoneNumber,
    });

  dbUser = created;
} else {
  const [updated] = await db
    .update(usersTable)
    .set({
      role: effectiveRole,
      updatedAt: new Date(),
    })
    .where(eq(usersTable.id, dbUser.id))
    .returning({
      id: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      avatarUrl: usersTable.avatarUrl,
      role: usersTable.role,
      phoneNumber: usersTable.phoneNumber,
    });

  dbUser = updated;
}
      const sessionUser = await buildSessionUser({
        ...dbUser,
        phoneNumber: requestedPhoneNumber,
      });

      req.login(sessionUser, (err) => {
        if (err) {
          logger.error({ err }, "[dev-login] req.login gagal");
          res.status(500).json({
            error: "Login gagal",
          });
          return;
        }

        logger.info(
          {
            role: sessionUser.role,
            phoneNumber: requestedPhoneNumber,
          },
          "[dev-login] berhasil"
        );

        res.json(sessionUser);
      });

    } catch (err) {
      logger.error(
        {
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
        },
  "[dev-login] Error membuat user"
);

      res.status(500).json({
        error: "Gagal membuat sesi dev login",
      });
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

// ─── GET /api/users — daftar semua user ──────────────────────────────────────

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
        lastLoginAt: usersTable.lastLoginAt,
      })
      .from(usersTable)
      .orderBy(asc(usersTable.createdAt));
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: "Gagal mengambil daftar user" });
  }
});

// ─── POST /api/users — buat user baru ────────────────────────────────────────

router.post("/users", requireAuth, requireAnyRole("owner"), async (req, res) => {
  const { name, email, role, phoneNumber, status } = req.body as {
    name?: string;
    email?: string;
    role?: string;
    phoneNumber?: string;
    status?: string;
  };

  if (!name?.trim()) {
    res.status(400).json({ error: "Nama wajib diisi" });
    return;
  }
  if (!role || !USER_ROLES.includes(role as UserRole)) {
    res.status(400).json({ error: `Peran tidak valid. Pilihan: ${USER_ROLES.join(", ")}` });
    return;
  }
  if (status && !USER_STATUSES.includes(status as any)) {
    res.status(400).json({ error: `Status tidak valid. Pilihan: ${USER_STATUSES.join(", ")}` });
    return;
  }

  try {
    if (email) {
      const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email.trim()));
      if (existing) {
        res.status(409).json({ error: "Email sudah terdaftar" });
        return;
      }
    }

    const [created] = await db
      .insert(usersTable)
      .values({
        id: randomUUID(),
        name: name.trim(),
        email: email?.trim() || null,
        role: role as UserRole,
        phoneNumber: phoneNumber?.trim() || null,
        status: (status ?? "active") as any,
      })
      .returning({
        id: usersTable.id,
        email: usersTable.email,
        name: usersTable.name,
        role: usersTable.role,
        phoneNumber: usersTable.phoneNumber,
        status: usersTable.status,
        avatarUrl: usersTable.avatarUrl,
        createdAt: usersTable.createdAt,
        updatedAt: usersTable.updatedAt,
      });

    logAudit(req, {
      action: "create_user",
      entityType: "user",
      entityId: created.id,
      afterData: { name: created.name, email: created.email, role: created.role, status: created.status },
    });

    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: "Gagal membuat user" });
  }
});

// ─── PUT /api/users/:id — update user ────────────────────────────────────────

router.put("/users/:id", requireAuth, requireAnyRole("owner"), async (req, res) => {
  const id = String(req.params.id);
  const { name, email, role, phoneNumber, status } = req.body as {
    name?: string;
    email?: string;
    role?: string;
    phoneNumber?: string;
    status?: string;
  };

  if (name !== undefined && !name.trim()) {
    res.status(400).json({ error: "Nama tidak boleh kosong" });
    return;
  }
  if (role && !USER_ROLES.includes(role as UserRole)) {
    res.status(400).json({ error: `Peran tidak valid. Pilihan: ${USER_ROLES.join(", ")}` });
    return;
  }
  if (status && !USER_STATUSES.includes(status as any)) {
    res.status(400).json({ error: `Status tidak valid` });
    return;
  }

  try {
    const [before] = await db.select().from(usersTable).where(eq(usersTable.id, id));
    if (!before) {
      res.status(404).json({ error: "User tidak ditemukan" });
      return;
    }

    if (email && email !== before.email) {
      const [dup] = await db.select({ id: usersTable.id }).from(usersTable).where(and(eq(usersTable.email, email.trim()), ne(usersTable.id, id)));
      if (dup) {
        res.status(409).json({ error: "Email sudah digunakan user lain" });
        return;
      }
    }

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) patch.name = name.trim();
    if (email !== undefined) patch.email = email.trim() || null;
    if (role !== undefined) patch.role = role;
    if (phoneNumber !== undefined) patch.phoneNumber = phoneNumber.trim() || null;
    if (status !== undefined) patch.status = status;

    const [updated] = await db
      .update(usersTable)
      .set(patch as any)
      .where(eq(usersTable.id, id))
      .returning({
        id: usersTable.id,
        email: usersTable.email,
        name: usersTable.name,
        role: usersTable.role,
        phoneNumber: usersTable.phoneNumber,
        status: usersTable.status,
        avatarUrl: usersTable.avatarUrl,
        createdAt: usersTable.createdAt,
        updatedAt: usersTable.updatedAt,
      });

    invalidateUserStatusCache(id);

    logAudit(req, {
      action: "update_user",
      entityType: "user",
      entityId: id,
      beforeData: { name: before.name, email: before.email, role: before.role, status: before.status },
      afterData: { name: updated.name, email: updated.email, role: updated.role, status: updated.status },
    });

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Gagal memperbarui user" });
  }
});

// ─── PATCH /api/users/:id/role — ubah peran (backward compat) ────────────────

router.patch("/users/:id/role", requireAuth, requireAnyRole("owner"), async (req, res) => {
  const id = String(req.params.id);
  if (!id) {
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

    invalidateUserStatusCache(id);

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

// ─── DELETE /api/users/:id — hapus user ──────────────────────────────────────

router.delete("/users/:id", requireAuth, requireAnyRole("owner"), async (req, res) => {
  const id = String(req.params.id);
  const currentUserId = req.user?.dbId;

  if (id === currentUserId) {
    res.status(400).json({ error: "Tidak dapat menghapus akun Anda sendiri" });
    return;
  }

  try {
    const [target] = await db.select().from(usersTable).where(eq(usersTable.id, id));
    if (!target) {
      res.status(404).json({ error: "User tidak ditemukan" });
      return;
    }

    await db.delete(tenantUserAccessTable).where(eq(tenantUserAccessTable.userId, id));
    await db.delete(usersTable).where(eq(usersTable.id, id));

    invalidateUserStatusCache(id);

    logAudit(req, {
      action: "delete_user",
      entityType: "user",
      entityId: id,
      beforeData: { name: target.name, email: target.email, role: target.role },
    });

    res.json({ ok: true, deleted: id });
  } catch (err) {
    res.status(500).json({ error: "Gagal menghapus user" });
  }
});

// ─── POST /api/users/:id/reset-session — paksa logout sesi aktif ─────────────

router.post("/users/:id/reset-session", requireAuth, requireAnyRole("owner"), async (req, res) => {
  const id = String(req.params.id);
  const currentUserId = req.user?.dbId;

  if (id === currentUserId) {
    res.status(400).json({ error: "Tidak dapat mereset sesi Anda sendiri" });
    return;
  }

  try {
    const [target] = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(eq(usersTable.id, id));
    if (!target) {
      res.status(404).json({ error: "User tidak ditemukan" });
      return;
    }

    const now = new Date();
    await db
      .update(usersTable)
      .set({ forceLogoutAt: now, updatedAt: now })
      .where(eq(usersTable.id, id));

    invalidateUserStatusCache(id);

    logAudit(req, {
      action: "reset_user_session",
      entityType: "user",
      entityId: id,
      afterData: { name: target.name, forceLogoutAt: now.toISOString() },
    });

    res.json({ ok: true, message: `Sesi ${target.name} telah direset` });
  } catch (err) {
    res.status(500).json({ error: "Gagal mereset sesi user" });
  }
});

export default router;
