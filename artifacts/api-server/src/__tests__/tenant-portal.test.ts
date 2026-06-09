import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../app";
import {
  getDefaultSiteId,
  getSportSiteId,
  createTestTenant,
  createTestInvoice,
  createTestBooking,
  createTestTenantUser,
  cleanupAll,
  TEST_PREFIX,
} from "./helpers/factory";
import { makeAuthAgent } from "./helpers/agent";

let tenantA: any;
let tenantB: any;
let tenantUserA: any;
let tenantUserB: any;
let siteId: number;
let sportSiteId: number;
let adminAgent: any;
let cashierAgent: any;
let invoiceA: any;
let invoiceB: any;

beforeAll(async () => {
  siteId = await getDefaultSiteId();
  sportSiteId = await getSportSiteId();
  adminAgent = await makeAuthAgent("admin");
  cashierAgent = await makeAuthAgent("cashier");

  tenantA = await createTestTenant({ siteId });
  tenantB = await createTestTenant({ siteId: sportSiteId });

  const { user: userA } = await createTestTenantUser(tenantA.id, siteId);
  const { user: userB } = await createTestTenantUser(tenantB.id, sportSiteId);
  tenantUserA = userA;
  tenantUserB = userB;

  invoiceA = await createTestInvoice(tenantA.id);
  invoiceB = await createTestInvoice(tenantB.id);
});

afterAll(cleanupAll);

async function loginAsTenantUser(userId: number, phone: string) {
  const agent = request.agent(app as any);
  const res = await agent.post("/api/auth/dev-login").send({
    role: "tenant_user",
    phoneNumber: phone,
    name: "Test Tenant",
  });
  if (res.status !== 200) throw new Error(`Tenant user login failed: ${JSON.stringify(res.body)}`);
  return agent;
}

describe("Fase 5 — Tenant Portal Backend", () => {
  it("tenant_user bisa akses /api/tenant-portal/me", async () => {
    const agent = await loginAsTenantUser(tenantUserA.id, tenantUserA.phoneNumber);
    const res = await agent.get("/api/tenant-portal/me");
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("tenant_user");
    expect(Array.isArray(res.body.tenantAccess)).toBe(true);
  });

  it("tenant_user hanya bisa lihat invoice miliknya", async () => {
    const agent = await loginAsTenantUser(tenantUserA.id, tenantUserA.phoneNumber);
    const res = await agent.get("/api/tenant-portal/invoices");
    expect(res.status).toBe(200);
    const ids = res.body.map((i: any) => i.id);
    expect(ids).toContain(invoiceA.id);
    expect(ids).not.toContain(invoiceB.id);
  });

  it("tenant_user tidak bisa lihat invoice tenant lain", async () => {
    const agent = await loginAsTenantUser(tenantUserA.id, tenantUserA.phoneNumber);
    const res = await agent.get("/api/tenant-portal/invoices");
    const ids = res.body.map((i: any) => i.id);
    expect(ids).not.toContain(invoiceB.id);
  });

  it("tenant_user tidak bisa akses /api/tenants global", async () => {
    const agent = await loginAsTenantUser(tenantUserA.id, tenantUserA.phoneNumber);
    const res = await agent.get("/api/tenants");
    expect(res.status).toBe(403);
  });

  it("tenant_user tidak bisa akses /api/laporan global", async () => {
    const agent = await loginAsTenantUser(tenantUserA.id, tenantUserA.phoneNumber);
    const res = await agent.get("/api/laporan/summary");
    expect(res.status).toBe(403);
  });

  it("tenant_user tidak bisa akses /api/audit-logs", async () => {
    const agent = await loginAsTenantUser(tenantUserA.id, tenantUserA.phoneNumber);
    const res = await agent.get("/api/audit-logs");
    expect(res.status).toBe(403);
  });

  it("tenant_user tidak bisa akses /api/users", async () => {
    const agent = await loginAsTenantUser(tenantUserA.id, tenantUserA.phoneNumber);
    const res = await agent.get("/api/users");
    expect(res.status).toBe(403);
  });

  it("data tenant user terfilter berdasarkan site_id — Sport Center tidak lihat TOD M1", async () => {
    const agent = await loginAsTenantUser(tenantUserB.id, tenantUserB.phoneNumber);
    const res = await agent.get("/api/tenant-portal/invoices");
    expect(res.status).toBe(200);
    const ids = res.body.map((i: any) => i.id);
    expect(ids).not.toContain(invoiceA.id);
  });

  it("TOD M1 tenant user tidak bisa lihat Sport Center tenant", async () => {
    const agent = await loginAsTenantUser(tenantUserA.id, tenantUserA.phoneNumber);
    const res = await agent.get("/api/tenant-portal/invoices");
    const ids = res.body.map((i: any) => i.id);
    expect(ids).not.toContain(invoiceB.id);
  });

  it("non-authenticated tidak bisa akses tenant portal", async () => {
    const res = await request(app as any).get("/api/tenant-portal/me");
    expect(res.status).toBe(401);
  });
});

describe("Fase 6 — Admin Kelola Akun Tenant", () => {
  it("admin bisa membuat akun tenant user", async () => {
    const phone = `628200${Date.now().toString().slice(-6)}`;
    const res = await adminAgent.post(`/api/tenants/${tenantA.id}/users`).send({
      name: `${TEST_PREFIX} User Baru`,
      phoneNumber: phone,
      accessLevel: "viewer",
      siteId,
    });
    expect(res.status).toBe(201);
    expect(res.body.user).toBeTruthy();
    expect(res.body.access.tenantId).toBe(tenantA.id);
  });

  it("cashier tidak bisa membuat akun tenant", async () => {
    const res = await cashierAgent.post(`/api/tenants/${tenantA.id}/users`).send({
      name: "Unauthorized User",
      phoneNumber: "62811111111",
      accessLevel: "viewer",
      siteId,
    });
    expect(res.status).toBe(403);
  });

  it("admin bisa melihat daftar user tenant", async () => {
    const res = await adminAgent.get(`/api/tenants/${tenantA.id}/users`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("admin bisa deaktivasi user tenant", async () => {
    const phone = `628300${Date.now().toString().slice(-6)}`;
    const createRes = await adminAgent.post(`/api/tenants/${tenantA.id}/users`).send({
      name: "User Untuk Deaktivasi",
      phoneNumber: phone,
      accessLevel: "viewer",
      siteId,
    });
    expect(createRes.status).toBe(201);
    const userId = createRes.body.user.id;

    const patchRes = await adminAgent
      .patch(`/api/tenants/${tenantA.id}/users/${userId}`)
      .send({ status: "inactive" });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.status).toBe("inactive");
  });
});
