export const dbConfig = {
  url:
    process.env["SUPABASE_PG_URL"] ??
    process.env["SUPABASE_DATABASE_URL_DEV"] ??
    process.env["DATABASE_URL"] ??
    (() => {
      throw new Error(
        "Salah satu dari SUPABASE_PG_URL, SUPABASE_DATABASE_URL_DEV, atau DATABASE_URL harus diset",
      );
    })(),
  ssl: {
    rejectUnauthorized: false,
  },
} as const;
