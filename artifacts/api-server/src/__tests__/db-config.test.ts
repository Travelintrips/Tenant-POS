import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const MANAGED_ENV_KEYS = [
  "NODE_ENV",
  "SUPABASE_URL",
  "SUPABASE_PG_URL_PROD",
  "SUPABASE_POOLER_URL",
  "SUPABASE_PG_URL",
  "SUPABASE_DATABASE_URL",
  "DATABASE_URL",
] as const;

const originalEnv = Object.fromEntries(
  MANAGED_ENV_KEYS.map((key) => [key, process.env[key]]),
) as Record<(typeof MANAGED_ENV_KEYS)[number], string | undefined>;

async function loadConfig() {
  vi.resetModules();
  const mod = await import("../../../../lib/db/src/config");
  return mod.dbConfig;
}

describe("Supabase production database URL resolution", () => {
  beforeEach(() => {
    for (const key of MANAGED_ENV_KEYS) delete process.env[key];
    process.env.NODE_ENV = "production";
    process.env.SUPABASE_URL = "https://nzdweipzckfszczzqtuw.supabase.co";
  });

  afterEach(() => {
    for (const key of MANAGED_ENV_KEYS) {
      const value = originalEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    vi.resetModules();
  });

  it("keeps a Dedicated Transaction Pooler URL on port 6543", async () => {
    const url =
      "postgresql://postgres:unit-test-value@db.nzdweipzckfszczzqtuw.supabase.co:6543/postgres";
    process.env.SUPABASE_PG_URL_PROD = url;
    process.env.SUPABASE_POOLER_URL = url;

    const config = await loadConfig();

    expect(config.source).toBe("SUPABASE_PG_URL_PROD");
    expect(config.poolMode).toBe("transaction");
    expect(config.projectRef).toBe("nzdweipzckfszczzqtuw");
    expect(config.host).toBe("db.nzdweipzckfszczzqtuw.supabase.co");
    expect(config.port).toBe(6543);
    expect(config.url).toBe(url);
  });

  it("keeps a project direct connection on port 5432 as direct mode", async () => {
    const url =
      "postgresql://postgres:unit-test-value@db.nzdweipzckfszczzqtuw.supabase.co:5432/postgres";
    process.env.SUPABASE_PG_URL_PROD = url;

    const config = await loadConfig();

    expect(config.poolMode).toBe("direct");
    expect(config.host).toBe("db.nzdweipzckfszczzqtuw.supabase.co");
    expect(config.port).toBe(5432);
    expect(config.url).toBe(url);
  });

  it("still recognises the shared Supavisor transaction pooler", async () => {
    const url =
      "postgresql://postgres.nzdweipzckfszczzqtuw:unit-test-value@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres";
    process.env.SUPABASE_POOLER_URL = url;

    const config = await loadConfig();

    expect(config.source).toBe("SUPABASE_POOLER_URL");
    expect(config.poolMode).toBe("transaction");
    expect(config.projectRef).toBe("nzdweipzckfszczzqtuw");
    expect(config.host).toBe("aws-1-ap-southeast-2.pooler.supabase.com");
    expect(config.port).toBe(6543);
  });
});
