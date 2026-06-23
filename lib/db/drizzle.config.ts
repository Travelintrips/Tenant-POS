import { defineConfig } from "drizzle-kit";
import path from "path";

const isProduction = (process.env["NODE_ENV"] ?? "development") === "production";

let url = isProduction
  ? (process.env["SUPABASE_PG_URL"] ?? process.env["DATABASE_URL"])
  : (process.env["SUPABASE_PG_URL_DEV"] ?? process.env["DATABASE_URL"]);

if (!url) {
  throw new Error(
    isProduction
      ? "SUPABASE_PG_URL atau DATABASE_URL harus diset di production"
      : "SUPABASE_PG_URL_DEV atau DATABASE_URL harus diset di development"
  );
}

const isSupabase = url.includes("supabase") || url.includes("pooler");

// drizzle-kit push requires session pooler (port 5432), not transaction pooler (port 6543)
if (isSupabase && url.includes(":6543")) {
  url = url.replace(":6543", ":5432");
}

// Supabase requires SSL with libpq-compatible mode for drizzle-kit
if (isSupabase) {
  const sep = url.includes("?") ? "&" : "?";
  if (!url.includes("sslmode")) {
    url += `${sep}sslmode=require&uselibpqcompat=true`;
  } else if (!url.includes("uselibpqcompat")) {
    url += `&uselibpqcompat=true`;
  }
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: { url },
});
