import { dbConfig } from "@workspace/db";

const isProduction = (process.env["NODE_ENV"] ?? "development") === "production";

function optional(key: string, fallback?: string): string | undefined {
  return process.env[key] ?? fallback;
}

export const config = {
  env: (process.env["NODE_ENV"] ?? "development") as
    | "development"
    | "production"
    | "test",
  port: Number(process.env["PORT"] ?? "8080"),
  logLevel: optional("LOG_LEVEL", "info") as string,

  db: {
    url: dbConfig.url,
  },

  auth: {
    portalAdminKey: optional("PORTAL_ADMIN_KEY"),
  },

  google: {
    clientSecret: optional("GOOGLE_CLIENT_SECRET"),
    serviceAccountJson: optional("GOOGLE_SERVICE_ACCOUNT_JSON"),
  },
} as const;
