import { Router, type IRouter } from "express";
import { db, pool } from "@workspace/db";
import {
  tenantsTable,
  tenantBookingsTable,
  tenantInvoicesTable,
  tenantPaymentsTable,
  usersTable,
  mallUnitsTable,
} from "@workspace/db/schema";
import { sql } from "drizzle-orm";
import { requireAnyRole } from "../middlewares/auth";
import { dbConfig } from "@workspace/db";

const router: IRouter = Router();

router.get("/system/db-status", requireAnyRole("owner", "admin"), async (req, res) => {
  const start = Date.now();
  try {
    // Ping DB
    await db.execute(sql`SELECT 1`);
    const pingMs = Date.now() - start;

    // Count per tabel
    const [
      tenantRow,
      bookingRow,
      invoiceRow,
      paymentRow,
      userRow,
      unitRow,
    ] = await Promise.all([
      db.select({ count: sql<number>`COUNT(*)::int` }).from(tenantsTable),
      db.select({ count: sql<number>`COUNT(*)::int` }).from(tenantBookingsTable),
      db.select({ count: sql<number>`COUNT(*)::int` }).from(tenantInvoicesTable),
      db.select({ count: sql<number>`COUNT(*)::int` }).from(tenantPaymentsTable),
      db.select({ count: sql<number>`COUNT(*)::int` }).from(usersTable),
      db.select({ count: sql<number>`COUNT(*)::int` }).from(mallUnitsTable),
    ]);

    // Info pool koneksi
    const poolInfo = {
      totalCount: pool.totalCount,
      idleCount: pool.idleCount,
      waitingCount: pool.waitingCount,
    };

    // Info host dari dbConfig
    const parsed = dbConfig.parsed as Record<string, unknown>;
    const host = (parsed.host as string | undefined) ?? "—";
    const isSupabase = host.includes("supabase") || host.includes("pooler");

    res.json({
      status: "ok",
      pingMs,
      database: {
        host,
        isSupabase,
        env: dbConfig.env,
        ssl: dbConfig.ssl !== false,
      },
      pool: poolInfo,
      tables: {
        tenants: tenantRow[0]?.count ?? 0,
        bookings: bookingRow[0]?.count ?? 0,
        invoices: invoiceRow[0]?.count ?? 0,
        payments: paymentRow[0]?.count ?? 0,
        users: userRow[0]?.count ?? 0,
        mall_units: unitRow[0]?.count ?? 0,
      },
      checkedAt: new Date().toISOString(),
    });
  } catch (err) {
    const pingMs = Date.now() - start;
    req.log.error(err, "DB status check failed");
    res.status(500).json({
      status: "error",
      pingMs,
      error: err instanceof Error ? err.message : String(err),
      checkedAt: new Date().toISOString(),
    });
  }
});

export default router;
