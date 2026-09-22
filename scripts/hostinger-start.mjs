process.env.NODE_ENV = "production";

if (!process.env.PORT) {
  process.env.PORT = "3000";
}

await import("../artifacts/api-server/dist/index.mjs");
