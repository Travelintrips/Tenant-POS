function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Environment variable "${key}" harus diset`);
  return value;
}

function optional(key: string, fallback?: string): string | undefined {
  return process.env[key] ?? fallback;
}

export const config = {
  env: (process.env["NODE_ENV"] ?? "development") as
    | "development"
    | "production"
    | "test",
  port: Number(required("PORT")),
  logLevel: optional("LOG_LEVEL", "info") as string,

  db: {
    url:
      process.env["SUPABASE_DATABASE_URL"] ??
      process.env["DATABASE_URL"] ??
      (() => {
        throw new Error("SUPABASE_DATABASE_URL atau DATABASE_URL harus diset");
      })(),
  },

  auth: {
    portalAdminKey: optional("PORTAL_ADMIN_KEY"),
  },

  google: {
    clientSecret: optional("GOOGLE_CLIENT_SECRET"),
    serviceAccountJson: optional("GOOGLE_SERVICE_ACCOUNT_JSON"),
  },
} as const;
