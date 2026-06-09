import request from "supertest";
import app from "../../app";

export type TestRole = "owner" | "admin" | "finance" | "cashier";

const WORKER_ID = `${process.pid}-${Date.now().toString(36)}`;

const TEST_EMAILS: Record<TestRole, string> = {
  owner: `tw-owner-${WORKER_ID}@test.local`,
  admin: `tw-admin-${WORKER_ID}@test.local`,
  finance: `tw-finance-${WORKER_ID}@test.local`,
  cashier: `tw-cashier-${WORKER_ID}@test.local`,
};

export async function makeAuthAgent(role: TestRole = "owner") {
  const agent = request.agent(app as any);
  const res = await agent.post("/api/auth/dev-login").send({
    email: TEST_EMAILS[role],
    name: `Test ${role.charAt(0).toUpperCase() + role.slice(1)}`,
    role,
  });
  if (res.status !== 200) {
    throw new Error(`Dev login gagal untuk role '${role}': ${res.status} ${JSON.stringify(res.body)}`);
  }
  return agent;
}

export function unauthAgent() {
  return request(app as any);
}
