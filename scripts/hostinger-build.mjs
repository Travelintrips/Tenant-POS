import { spawnSync } from "node:child_process";

const pnpmVersion = process.env.PNPM_VERSION || "10.33.0";
const npmUa = process.env.npm_config_user_agent || "";

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit", env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (npmUa.startsWith("npm/")) {
  run("npx", ["--yes", `pnpm@${pnpmVersion}`, "install", "--frozen-lockfile"]);
  run("npx", ["--yes", `pnpm@${pnpmVersion}`, "run", "build:workspace"]);
} else {
  run("pnpm", ["run", "build:workspace"]);
}
