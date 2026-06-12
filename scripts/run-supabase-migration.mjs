/**
 * Script untuk menjalankan migration ke Supabase menggunakan koneksi direct.
 * Menangani password dengan karakter khusus yang URL-encoded.
 */
import pg from "pg";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Parse SUPABASE_PG_URL dengan aman (handle special chars di password)
function parseSupabaseUrl(rawUrl) {
  const match = rawUrl.match(/^postgresql:\/\/([^:]+):(.+)@([^:\/]+):(\d+)\/(.+)$/);
  if (!match) throw new Error("Format SUPABASE_PG_URL tidak valid");
  const [_, user, passEnc, host, portStr, database] = match;
  return {
    user,
    password: decodeURIComponent(passEnc),
    host,
    port: parseInt(portStr, 10),
    database,
  };
}

// Import migrator logic inline untuk menghindari masalah module resolution
async function getMigrations() {
  // Dynamically import the compiled migrator
  const { runMigrations } = await import("../lib/db/src/migrator.ts");
  return runMigrations;
}

const raw = process.env.SUPABASE_PG_URL;
if (!raw) {
  console.error("ERROR: SUPABASE_PG_URL tidak diset");
  process.exit(1);
}

const connParams = parseSupabaseUrl(raw);
console.log(`[supabase-migrate] Menghubungkan ke ${connParams.host}:${connParams.port}/${connParams.database}...`);

// Override DATABASE_URL dengan koneksi yang sudah di-decode agar migrator bisa pakai
const { Pool } = pg;
const pool = new Pool({
  ...connParams,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});

try {
  const client = await pool.connect();
  console.log("[supabase-migrate] Koneksi berhasil ✓");
  client.release();
  await pool.end();
} catch (err) {
  console.error("[supabase-migrate] Koneksi gagal:", err.message);
  process.exit(1);
}
