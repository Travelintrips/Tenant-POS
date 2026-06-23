const isProduction = (process.env["NODE_ENV"] ?? "development") === "production";

function optional(key: string, fallback?: string): string | undefined {
  return process.env[key] ?? fallback;
}

function resolveDbUrl(): string {
  if (isProduction) {
    return (
      process.env["SUPABASE_DATABASE_URL"] ??
      process.env["DATABASE_URL"] ??
      (() => { throw new Error("SUPABASE_DATABASE_URL atau DATABASE_URL harus diset di production"); })()
    );
  }
  return (
    process.env["SUPABASE_DATABASE_URL_DEV"] ??
    process.env["DATABASE_URL"] ??
    (() => { throw new Error("SUPABASE_DATABASE_URL_DEV atau DATABASE_URL harus diset di development"); })()
  );
}

export const config = {
  env: (process.env["NODE_ENV"] ?? "development") as
    | "development"
    | "production"
    | "test",
  port: Number(process.env["PORT"] ?? "8080"),
  logLevel: optional("LOG_LEVEL", "info") as string,

  db: {
    url: resolveDbUrl(),
  },

  auth: {
    portalAdminKey: optional("PORTAL_ADMIN_KEY"),
  },

  google: {
    clientSecret: optional("GOOGLE_CLIENT_SECRET"),
    serviceAccountJson: optional("GOOGLE_SERVICE_ACCOUNT_JSON"),
  },
} as const;
