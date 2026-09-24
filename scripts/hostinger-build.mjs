import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const pnpmVersion = process.env.PNPM_VERSION || "10.33.0";
const npmUa = process.env.npm_config_user_agent || "";

const runtimeBridgePath = path.join(
  process.cwd(),
  "artifacts",
  "api-server",
  "dist",
  ".hostinger-runtime-env.json",
);

const runtimeBridgeKeys = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "FONNTE_API_KEY",
  "FONNTE_TOKEN",
  "ADMIN_WA_GROUP",
  "ADMIN_WHATSAPP",
  "FONNTE_ADMIN_WA",
];

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit", env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function writeRuntimeEnvBridge() {
  const captured = {};
  for (const key of runtimeBridgeKeys) {
    const value = process.env[key]?.trim();
    if (value) captured[key] = value;
  }

  if (Object.keys(captured).length === 0) {
    if (existsSync(runtimeBridgePath)) rmSync(runtimeBridgePath, { force: true });
  } else {
    mkdirSync(path.dirname(runtimeBridgePath), { recursive: true });
    writeFileSync(runtimeBridgePath, JSON.stringify(captured), {
      encoding: "utf8",
      mode: 0o600,
    });
    try {
      chmodSync(runtimeBridgePath, 0o600);
    } catch {
      // Best effort; some managed build filesystems do not preserve chmod.
    }
  }

  console.log(
    "[hostinger-build] auth env detected: " +
      runtimeBridgeKeys
        .map((key) => `${key}=${Boolean(captured[key])}`)
        .join(", "),
  );
}

if (npmUa.startsWith("npm/")) {
  run("npx", ["--yes", `pnpm@${pnpmVersion}`, "install", "--frozen-lockfile"]);
  run("npx", ["--yes", `pnpm@${pnpmVersion}`, "run", "build:workspace"]);
} else {
  run("pnpm", ["run", "build:workspace"]);
}

// Hostinger can expose Environment Variables during build but not forward all of
// them to the Node runtime. Persist only the server-side auth/notification
// configuration into the private API dist folder so hostinger-start can restore
// missing runtime values.
// This file is never under the public admin-portal static directory.
writeRuntimeEnvBridge();
