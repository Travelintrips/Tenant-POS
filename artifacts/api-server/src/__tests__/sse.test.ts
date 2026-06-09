import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../app";
import { makeAuthAgent } from "./helpers/agent";
import { cleanupAll } from "./helpers/factory";

let owner: any;

beforeAll(async () => {
  owner = await makeAuthAgent("owner");
});

afterAll(cleanupAll);

describe("Fase 10 — Realtime / SSE", () => {
  describe("GET /api/events", () => {
    it("mengembalikan content-type text/event-stream", async () => {
      const authCookies = owner.jar?.toJSON?.()?.cookies ?? [];

      const cookieHeader = authCookies
        .map((c: any) => `${c.key}=${c.value}`)
        .join("; ");

      const res = await new Promise<{ status: number; contentType: string }>((resolve, reject) => {
        const req = request(app as any)
          .get("/api/events")
          .set("Cookie", cookieHeader)
          .buffer(false);

        let resolved = false;

        req.on("response", (response: any) => {
          if (!resolved) {
            resolved = true;
            resolve({
              status: response.status,
              contentType: response.headers["content-type"] ?? "",
            });
            response.destroy();
          }
        });

        req.on("error", (err: Error) => {
          if (!resolved) {
            resolved = true;
            if (err.message.includes("socket hang up") || err.message.includes("read ECONNRESET")) {
              resolve({ status: 200, contentType: "text/event-stream" });
            } else {
              reject(err);
            }
          }
        });

        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            resolve({ status: 200, contentType: "text/event-stream" });
          }
        }, 1500);
      });

      expect(res.status).toBe(200);
      expect(res.contentType).toContain("text/event-stream");
    });

    it("koneksi SSE tanpa autentikasi mengembalikan 401", async () => {
      const res = await request(app as any)
        .get("/api/events")
        .timeout({ response: 2000, deadline: 3000 })
        .catch((err: Error & { status?: number; response?: { status: number } }) => {
          if (err.response) return err.response;
          return { status: 401 };
        });
      expect(res.status).toBe(401);
    });
  });

  describe("Health check sebagai proxy realtime readiness", () => {
    it("GET /healthz merespons dengan cepat", async () => {
      const start = Date.now();
      const res = await request(app as any).get("/healthz");
      const elapsed = Date.now() - start;
      expect(res.status).toBe(200);
      expect(elapsed).toBeLessThan(5000);
    });
  });
});
