import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { db } from "@workspace/db";
import { usersTable, otpTokensTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import request from "supertest";
import app from "../app";
import {
  getDefaultSiteId,
  createTestTenant,
  createRegisteredPhoneUser,
  cleanupAll,
  TEST_PREFIX,
} from "./helpers/factory";
import { makeAuthAgent } from "./helpers/agent";

const TEST_PHONE = `628123${Date.now().toString().slice(-6)}`;

async function cleanupOtps(phone: string) {
  await db.delete(otpTokensTable).where(eq(otpTokensTable.phoneNumber, phone));
}

beforeAll(async () => {
  const siteId = await getDefaultSiteId();
  const tenant = await createTestTenant();
  await createRegisteredPhoneUser(TEST_PHONE, tenant.id, siteId);
});

afterAll(async () => {
  await cleanupOtps(TEST_PHONE);
  await cleanupAll();
});

beforeEach(async () => {
  await cleanupOtps(TEST_PHONE);
});

describe("Fase 2+8 — Login WhatsApp OTP", () => {
  describe("POST /api/auth/whatsapp/request-otp", () => {
    it("nomor terdaftar mengembalikan message generik + devOtp", async () => {
      const res = await request(app as any)
        .post("/api/auth/whatsapp/request-otp")
        .send({ phoneNumber: TEST_PHONE });
      expect(res.status).toBe(200);
      expect(res.body.message).toContain("OTP");
      expect(res.body.devOtp).toMatch(/^\d{6}$/);
    });

    it("nomor tidak terdaftar mengembalikan message generik tanpa bocorkan data", async () => {
      const res = await request(app as any)
        .post("/api/auth/whatsapp/request-otp")
        .send({ phoneNumber: "62899999" + Date.now().toString().slice(-5) });
      expect(res.status).toBe(200);
      expect(res.body.message).toContain("OTP");
      expect(res.body.devOtp).toBeUndefined();
    });

    it("format nomor tidak valid ditolak (400)", async () => {
      const res = await request(app as any)
        .post("/api/auth/whatsapp/request-otp")
        .send({ phoneNumber: "abc" });
      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/auth/whatsapp/verify-otp", () => {
    it("OTP benar membuat session dan mengembalikan user", async () => {
      const reqRes = await request(app as any)
        .post("/api/auth/whatsapp/request-otp")
        .send({ phoneNumber: TEST_PHONE });
      const devOtp = reqRes.body.devOtp;
      expect(devOtp).toBeDefined();

      const agent = request.agent(app as any);
      const verRes = await agent
        .post("/api/auth/whatsapp/verify-otp")
        .send({ phoneNumber: TEST_PHONE, otp: devOtp });
      expect(verRes.status).toBe(200);
      expect(verRes.body.role).toBe("tenant_user");
      expect(verRes.body.phoneNumber).toBeTruthy();

      const meRes = await agent.get("/api/auth/me");
      expect(meRes.status).toBe(200);
      expect(meRes.body.role).toBe("tenant_user");
    });

    it("OTP salah ditolak (401)", async () => {
      await request(app as any)
        .post("/api/auth/whatsapp/request-otp")
        .send({ phoneNumber: TEST_PHONE });

      const res = await request(app as any)
        .post("/api/auth/whatsapp/verify-otp")
        .send({ phoneNumber: TEST_PHONE, otp: "000000" });
      expect(res.status).toBe(401);
      expect(res.body.error).toBeTruthy();
    });

    it("OTP tidak bisa digunakan dua kali", async () => {
      const reqRes = await request(app as any)
        .post("/api/auth/whatsapp/request-otp")
        .send({ phoneNumber: TEST_PHONE });
      const devOtp = reqRes.body.devOtp;

      const agent = request.agent(app as any);
      const first = await agent
        .post("/api/auth/whatsapp/verify-otp")
        .send({ phoneNumber: TEST_PHONE, otp: devOtp });
      expect(first.status).toBe(200);

      const second = await request(app as any)
        .post("/api/auth/whatsapp/verify-otp")
        .send({ phoneNumber: TEST_PHONE, otp: devOtp });
      expect(second.status).toBe(401);
    });

    it("OTP expired ditolak", async () => {
      const phone = `628100${Date.now().toString().slice(-7)}`;
      const siteId = await getDefaultSiteId();
      const tenant = await createTestTenant();
      await createRegisteredPhoneUser(phone, tenant.id, siteId);

      await request(app as any)
        .post("/api/auth/whatsapp/request-otp")
        .send({ phoneNumber: phone });

      await db
        .update(otpTokensTable)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(otpTokensTable.phoneNumber, phone));

      const reqRes2 = await request(app as any)
        .post("/api/auth/whatsapp/request-otp")
        .send({ phoneNumber: phone });
      const devOtp = reqRes2.body.devOtp;

      await db
        .update(otpTokensTable)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(otpTokensTable.phoneNumber, phone));

      const res = await request(app as any)
        .post("/api/auth/whatsapp/verify-otp")
        .send({ phoneNumber: phone, otp: devOtp });
      expect(res.status).toBe(401);
      expect(res.body.error).toContain("kedaluwarsa");

      await db.delete(otpTokensTable).where(eq(otpTokensTable.phoneNumber, phone));
    });
  });
});
