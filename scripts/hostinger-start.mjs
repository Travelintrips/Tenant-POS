import { spawn } from "node:child_process";

process.env.NODE_ENV = "production";
if (!process.env.PORT) process.env.PORT = "3000";

const child = spawn(process.execPath, [
  "--enable-source-maps",
  "./artifacts/api-server/dist/index.mjs",
], {
  stdio: "inherit",
  env: process.env,
});

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
