import { defineConfig } from "drizzle-kit";
import path from "path";

let url = process.env.SUPABASE_PG_URL || process.env.DATABASE_URL;

if (!url) {
  throw new Error("SUPABASE_PG_URL or DATABASE_URL must be set");
}

const isSupabase = url.includes("supabase");

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
