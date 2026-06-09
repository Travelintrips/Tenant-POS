import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { auditLogsTable } from "@workspace/db/schema";
import { eq, and, gte, lte, desc, ilike, or, sql } from "drizzle-orm";
import { requireAnyRole } from "../middlewares/auth";

const router: IRouter = Router();

router.use(requireAnyRole("owner", "admin"));

// ─── GET /api/audit-logs ──────────────────────────────────────────────────────
router.get("/audit-logs", async (req, res) => {
  const {
    dari,
    sampai,
    user_email,
    action,
    entity_type,
    limit: limitRaw,
    offset: offsetRaw,
  } = req.query;

  const limit = Math.min(Math.max(Number(limitRaw ?? 50), 1), 200);
  const offset = Math.max(Number(offsetRaw ?? 0), 0);

  const conditions: ReturnType<typeof eq>[] = [];

  if (dari) {
    conditions.push(gte(auditLogsTable.createdAt, new Date(String(dari))) as any);
  }
  if (sampai) {
    const end = new Date(String(sampai));
    end.setHours(23, 59, 59, 999);
    conditions.push(lte(auditLogsTable.createdAt, end) as any);
  }
  if (user_email) {
    conditions.push(ilike(auditLogsTable.userEmail, `%${String(user_email)}%`) as any);
  }
  if (action && action !== "all") {
    conditions.push(eq(auditLogsTable.action, String(action)) as any);
  }
  if (entity_type && entity_type !== "all") {
    conditions.push(eq(auditLogsTable.entityType, String(entity_type)) as any);
  }

  try {
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, totalRows] = await Promise.all([
      db
        .select()
        .from(auditLogsTable)
        .where(whereClause)
        .orderBy(desc(auditLogsTable.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(auditLogsTable)
        .where(whereClause),
    ]);

    res.json({
      data: rows,
      pagination: {
        total: totalRows[0]?.count ?? 0,
        limit,
        offset,
      },
    });
  } catch (err) {
    req.log.error(err, "Failed to list audit logs");
    res.status(500).json({ error: "Gagal mengambil audit log" });
  }
});

// ─── GET /api/audit-logs/:id ──────────────────────────────────────────────────
router.get("/audit-logs/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "ID tidak valid" });
    return;
  }
  try {
    const [row] = await db
      .select()
      .from(auditLogsTable)
      .where(eq(auditLogsTable.id, id));

    if (!row) {
      res.status(404).json({ error: "Audit log tidak ditemukan" });
      return;
    }
    res.json(row);
  } catch (err) {
    req.log.error(err, "Failed to get audit log");
    res.status(500).json({ error: "Gagal mengambil audit log" });
  }
});

export default router;
