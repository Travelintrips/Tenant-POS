import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./src/__tests__/setup.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
    pool: "forks",
    singleFork: true,
    include: ["src/__tests__/**/*.test.ts"],
    reporters: ["verbose"],
    env: {
      NODE_ENV: "test",
      PORT: "8080",
      LOG_LEVEL: "silent",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/__tests__/**", "src/index.ts"],
    },
  },
});
