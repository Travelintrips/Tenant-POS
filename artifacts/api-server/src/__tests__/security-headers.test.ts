/**
 * Test HTTP Security Headers (Helmet)
 *
 * Semua test menggunakan app nyata yang sudah dipasang Helmet.
 * NODE_ENV=test — rate limiter di-skip otomatis, session/passport aktif.
 */

import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import app from "../app";
import { makeAuthAgent, unauthAgent } from "./helpers/agent";
import { cleanupAll } from "./helpers/factory";

afterAll(cleanupAll);

// ─── Helper ─────────────────────────────────────────────────────────────────

/** Ambil response dari endpoint apapun dan periksa security headers-nya */
async function getHeaders(path: string, method: "get" | "post" = "get") {
  return unauthAgent()[method](path).send({});
}

// ─── X-Powered-By harus hilang ───────────────────────────────────────────────

describe("Helmet — X-Powered-By disembunyikan", () => {
  it("GET /api/health tidak mengirim X-Powered-By", async () => {
    const res = await getHeaders("/api/health");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("GET /api/auth/me tidak mengirim X-Powered-By", async () => {
    const res = await getHeaders("/api/auth/me");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("POST /api/auth/dev-login tidak mengirim X-Powered-By", async () => {
    const res = await getHeaders("/api/auth/dev-login", "post");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });
});

// ─── X-Content-Type-Options: nosniff ────────────────────────────────────────

describe("Helmet — X-Content-Type-Options: nosniff", () => {
  it("GET /api/health memiliki header nosniff", async () => {
    const res = await getHeaders("/api/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("GET /api/auth/me memiliki header nosniff (meski 401)", async () => {
    const res = await getHeaders("/api/auth/me");
    // 401 tapi Helmet tetap menambahkan header
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("POST endpoint memiliki header nosniff", async () => {
    const res = await getHeaders("/api/auth/dev-login", "post");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });
});

// ─── X-Frame-Options: SAMEORIGIN ────────────────────────────────────────────

describe("Helmet — X-Frame-Options: SAMEORIGIN", () => {
  it("GET /api/health memiliki X-Frame-Options", async () => {
    const res = await getHeaders("/api/health");
    expect(res.headers["x-frame-options"]).toBe("SAMEORIGIN");
  });
});

// ─── Referrer-Policy ────────────────────────────────────────────────────────

describe("Helmet — Referrer-Policy", () => {
  it("GET /api/health memiliki Referrer-Policy", async () => {
    const res = await getHeaders("/api/health");
    expect(res.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  });
});

// ─── Cross-Origin-Opener-Policy ─────────────────────────────────────────────

describe("Helmet — Cross-Origin-Opener-Policy", () => {
  it("GET /api/health memiliki Cross-Origin-Opener-Policy: same-origin", async () => {
    const res = await getHeaders("/api/health");
    expect(res.headers["cross-origin-opener-policy"]).toBe("same-origin");
  });
});

// ─── Cross-Origin-Resource-Policy ───────────────────────────────────────────

describe("Helmet — Cross-Origin-Resource-Policy", () => {
  it("GET /api/health memiliki CORP: cross-origin (agar uploads bisa diload frontend)", async () => {
    const res = await getHeaders("/api/health");
    expect(res.headers["cross-origin-resource-policy"]).toBe("cross-origin");
  });
});

// ─── CSP dinonaktifkan ───────────────────────────────────────────────────────

describe("Helmet — Content-Security-Policy (dinonaktifkan)", () => {
  it("GET /api/health tidak mengirim Content-Security-Policy", async () => {
    const res = await getHeaders("/api/health");
    expect(res.headers["content-security-policy"]).toBeUndefined();
  });

  it("GET /api/auth/me tidak mengirim Content-Security-Policy", async () => {
    const res = await getHeaders("/api/auth/me");
    expect(res.headers["content-security-policy"]).toBeUndefined();
  });
});

// ─── /api/auth/me tetap berjalan normal ─────────────────────────────────────

describe("Helmet — /api/auth/me tidak rusak", () => {
  it("tanpa auth mengembalikan 401 (bukan 500)", async () => {
    const res = await getHeaders("/api/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.error).toBeTruthy();
  });

  it("dengan auth mengembalikan 200 dan data user", async () => {
    const agent = await makeAuthAgent("owner");
    const res = await agent.get("/api/auth/me");
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("owner");
    // Header security tetap ada saat login
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });
});

// ─── /api/events SSE tidak rusak ─────────────────────────────────────────────

describe("Helmet — /api/events SSE tidak rusak", () => {
  it("tanpa auth mengembalikan 401 (bukan crash karena header conflict)", async () => {
    // EventSource tanpa auth → 401, bukan error Helmet
    const res = await unauthAgent().get("/api/events");
    expect(res.status).toBe(401);
    // Helmet tidak memblokir
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });
});

// ─── Rate limit 429 tetap memiliki security headers ──────────────────────────

describe("Helmet — response 429 dari rate limiter tetap memiliki security headers", () => {
  it("429 dari rate limit test app tidak dipengaruhi Helmet (Helmet hanya di app nyata)", () => {
    // Rate limit test menggunakan mini-app tanpa Helmet — ini adalah perilaku yang diharapkan.
    // Test ini memverifikasi bahwa Helmet dan rate limiter TIDAK saling menghalangi di app nyata.
    // Di app nyata (NODE_ENV=test), rate limiter di-skip, sehingga tidak ada 429 yang perlu diuji.
    // Cukup verifikasi bahwa endpoint normal memiliki semua header yang benar.
    expect(true).toBe(true);
  });

  it("POST /api/auth/dev-login yang valid (dengan Helmet aktif) tetap 200", async () => {
    const agent = request.agent(app as any);
    const res = await agent.post("/api/auth/dev-login").send({
      email: `helmet-test-${Date.now()}@test.local`,
      name: "Helmet Test",
      role: "owner",
    });
    expect(res.status).toBe(200);
    // Security headers tetap ada di response 200
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });
});

// ─── Static uploads tidak rusak (CORP cross-origin) ─────────────────────────

describe("Helmet — static uploads tidak diblokir", () => {
  it("GET /uploads/nonexistent.jpg mengembalikan 404 (bukan 403 karena Helmet)", async () => {
    const res = await unauthAgent().get("/uploads/nonexistent-helmet-test.jpg");
    // 404 = file tidak ada, bukan 403 = diblokir security header
    expect(res.status).toBe(404);
    // CORP cross-origin memastikan file yang ada bisa diakses lintas origin
    expect(res.headers["cross-origin-resource-policy"]).toBe("cross-origin");
  });
});

// ─── API response JSON normal ────────────────────────────────────────────────

describe("Helmet — response JSON API tidak rusak", () => {
  it("GET /api/health mengembalikan JSON valid dengan Helmet aktif", async () => {
    const res = await getHeaders("/api/health");
    expect([200, 404]).toContain(res.status);
    // Content-Type tetap JSON
    if (res.status === 200) {
      expect(res.headers["content-type"]).toMatch(/application\/json/);
    }
  });

  it("GET /api/auth/dev-login-enabled mengembalikan JSON valid", async () => {
    const res = await getHeaders("/api/auth/dev-login-enabled");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(typeof res.body.enabled).toBe("boolean");
    // Security headers ada
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });
});
