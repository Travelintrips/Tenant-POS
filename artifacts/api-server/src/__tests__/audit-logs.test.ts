import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeAuthAgent } from "./helpers/agent";
import { createTestTenant, createTestBooking, cleanupAll, TEST_PREFIX } from "./helpers/factory";
import { db } from "@workspace/db";
import { auditLogsTable } from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";

let owner: any;
let admin: any;
let finance: any;

beforeAll(async () => {
  [owner, admin, finance] = await Promise.all([
    makeAuthAgent("owner"),
    makeAuthAgent("admin"),
    makeAuthAgent("finance"),
  ]);
});

afterAll(cleanupAll);

describe("Fase 7 — Audit Log", () => {
  describe("GET /api/audit-logs", () => {
    it("owner bisa akses audit logs (200)", async () => {
      const res = await owner.get("/api/audit-logs");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("data");
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it("finance tidak bisa akses audit logs (403)", async () => {
      const res = await finance.get("/api/audit-logs");
      expect(res.status).toBe(403);
    });
  });

  describe("create_tenant menghasilkan audit log", () => {
    it("membuat tenant dan memeriksa audit log tersimpan", async () => {
      const createRes = await owner.post("/api/tenants").send({
        businessName: `${TEST_PREFIX} Tenant Audit Test`,
        ownerName: "Owner Audit",
        status: "active",
        areaName: "",
      });
      expect(createRes.status).toBe(201);
      const tenantId = createRes.body.id;

      await new Promise((r) => setTimeout(r, 200));

      const [log] = await db
        .select()
        .from(auditLogsTable)
        .where(
          and(
            eq(auditLogsTable.entityType, "tenant"),
            eq(auditLogsTable.entityId, String(tenantId))
          )
        )
        .orderBy(desc(auditLogsTable.id))
        .limit(1);

      expect(log).toBeDefined();
      expect(log.action).toBe("create_tenant");
      expect(log.entityId).toBe(String(tenantId));
    });
  });

  describe("data sensitif tidak masuk audit log", () => {
    it("audit log tidak menyimpan field password/token/secret", async () => {
      const res = await owner.get("/api/audit-logs?limit=20");
      expect(res.status).toBe(200);
      const logs = res.body.data as any[];

      for (const log of logs) {
        const dataStr = JSON.stringify({ before: log.beforeData, after: log.afterData });
        expect(dataStr).not.toMatch(/\"password\"\s*:/i);
        expect(dataStr).not.toMatch(/\"token\"\s*:/i);
        expect(dataStr).not.toMatch(/\"secret\"\s*:/i);
      }
    });
  });

  describe("update_booking menghasilkan audit log", () => {
    it("update booking dan verifikasi audit log", async () => {
      const tenant = await createTestTenant();
      const booking = await createTestBooking(tenant.id);

      const today = new Date();
      const future = new Date(today);
      future.setFullYear(today.getFullYear() + 2);

      await owner.put(`/api/bookings/${booking.id}`).send({
        tenantId: tenant.id,
        unitCode: booking.unitCode,
        startDate: today.toISOString().slice(0, 10),
        endDate: future.toISOString().slice(0, 10),
        rentAmount: "7000000",
        depositAmount: "0",
        serviceChargeAmount: "0",
        electricityChargeAmount: "0",
        waterChargeAmount: "0",
        totalAmount: "7000000",
        paidAmount: "0",
        remainingAmount: "7000000",
      });

      await new Promise((r) => setTimeout(r, 600));

      const [log] = await db
        .select()
        .from(auditLogsTable)
        .where(
          and(
            eq(auditLogsTable.entityType, "booking"),
            eq(auditLogsTable.entityId, String(booking.id))
          )
        )
        .orderBy(desc(auditLogsTable.id))
        .limit(1);

      expect(log).toBeDefined();
      expect(log.action).toBe("update_booking");
    });
  });

  describe("filter audit logs", () => {
    it("filter berdasarkan action bekerja", async () => {
      const res = await owner.get("/api/audit-logs?action=create_tenant");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("data");
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it("filter berdasarkan entityType bekerja", async () => {
      const res = await owner.get("/api/audit-logs?entity_type=tenant");
      expect(res.status).toBe(200);
      const logs = res.body.data as any[];
      for (const log of logs) {
        expect(log.entityType).toBe("tenant");
      }
    });
  });
});
