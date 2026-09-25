import { describe, expect, it } from "vitest";
import { isChunkLoadError } from "@/lib/chunk-recovery";

describe("chunk recovery detection", () => {
  it("mendeteksi Vite stale dynamic import setelah deploy", () => {
    expect(
      isChunkLoadError(
        new TypeError(
          "Failed to fetch dynamically imported module: https://tenant.travelintrips.co.id/assets/data-tenant-abc123.js",
        ),
      ),
    ).toBe(true);
  });

  it("mendeteksi variasi chunk/module error lintas browser", () => {
    expect(isChunkLoadError(new Error("ChunkLoadError: Loading chunk 42 failed."))).toBe(true);
    expect(isChunkLoadError(new Error("Importing a module script failed."))).toBe(true);
    expect(isChunkLoadError(new Error("Failed to load module script: Expected a JavaScript module script."))).toBe(true);
  });

  it("tidak menganggap error aplikasi biasa sebagai stale chunk", () => {
    expect(isChunkLoadError(new Error("Gagal memuat data tenant"))).toBe(false);
    expect(isChunkLoadError(new Error("HTTP 500"))).toBe(false);
  });
});
