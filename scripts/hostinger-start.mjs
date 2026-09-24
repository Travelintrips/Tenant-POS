import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

process.env.NODE_ENV = "production";

if (!process.env.PORT) {
  process.env.PORT = "3000";
}

const runtimeBridgePath = path.join(
  process.cwd(),
  "artifacts",
  "api-server",
  "dist",
  ".hostinger-runtime-env.json",
);

const allowedBridgeKeys = new Set([
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "FONNTE_API_KEY",
  "FONNTE_TOKEN",
]);

let bridgeUsed = false;

if (existsSync(runtimeBridgePath)) {
  try {
    const parsed = JSON.parse(readFileSync(runtimeBridgePath, "utf8"));
    for (const [key, value] of Object.entries(parsed)) {
      if (
        allowedBridgeKeys.has(key) &&
        typeof value === "string" &&
        value.trim() &&
        !process.env[key]?.trim()
      ) {
        process.env[key] = value.trim();
        bridgeUsed = true;
      }
    }
  } catch (error) {
    console.error(
      "[hostinger-start] gagal membaca runtime env bridge:",
      error instanceof Error ? error.message : String(error),
    );
  }
}

if (bridgeUsed) {
  process.env.GOOGLE_AUTH_ENV_SOURCE = "hostinger-build-bridge";
}

console.log(
  "[hostinger-start] auth env available: " +
    [
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "FONNTE_API_KEY",
      "FONNTE_TOKEN",
    ]
      .map((key) => `${key}=${Boolean(process.env[key]?.trim())}`)
      .join(", ") +
    `, bridgeUsed=${bridgeUsed}`,
);

await import("../artifacts/api-server/dist/index.mjs");
