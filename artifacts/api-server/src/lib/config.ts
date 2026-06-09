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
      process.env["SUPABASE_PG_URL"] ??
      process.env["SUPABASE_DATABASE_URL_DEV"] ??
      process.env["DATABASE_URL"] ??
      (() => {
        throw new Error(
          "Salah satu dari SUPABASE_PG_URL, SUPABASE_DATABASE_URL_DEV, atau DATABASE_URL harus diset",
        );
      })(),
  },

  supabase: {
    url: optional("SUPABASE_URL"),
    anonKey: optional("SUPABASE_ANON_KEY"),
    serviceRoleKey: optional("SUPABASE_SERVICE_ROLE_KEY"),
    urlDev: optional("SUPABASE_URL_DEV"),
    serviceRoleKeyDev: optional("SUPABASE_SERVICE_ROLE_KEY_DEV"),
  },

  auth: {
    portalAdminKey: optional("PORTAL_ADMIN_KEY"),
  },

  google: {
    clientSecret: optional("GOOGLE_CLIENT_SECRET"),
    serviceAccountJson: optional("GOOGLE_SERVICE_ACCOUNT_JSON"),
  },
} as const;
