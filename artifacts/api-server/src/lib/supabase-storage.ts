// Dev: coba URL/KEY versi _DEV dulu, fallback ke versi PROD
import { logger } from "./logger";
import { compressImageForStorage } from "./image-compression";
// Prod: pakai URL/KEY tanpa suffix (wajib diset di Replit Secrets)
const isProduction = process.env["NODE_ENV"] === "production";

const supabaseUrl = isProduction
  ? (process.env["SUPABASE_URL"] ?? "")
  : (process.env["SUPABASE_URL_DEV"] ?? process.env["SUPABASE_URL"] ?? "");

const supabaseKey = isProduction
  ? (process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "")
  : (
      process.env["SUPABASE_SERVICE_ROLE_KEY_DEV"] ??
      process.env["SUPABASE_SERVICE_ROLE_KEY"] ??
      ""
    );

const useSupabase = Boolean(supabaseUrl && supabaseKey);

if (!useSupabase) {
  logger.warn(
    "[supabase-storage] ⚠️  SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY tidak dikonfigurasi. " +
    "Upload file AKAN GAGAL — tidak ada fallback penyimpanan lokal. Set secret berikut di Replit:\n" +
    "  - SUPABASE_URL (atau SUPABASE_URL_DEV untuk dev)\n" +
    "  - SUPABASE_SERVICE_ROLE_KEY (atau SUPABASE_SERVICE_ROLE_KEY_DEV untuk dev)\n" +
    "Semua data file WAJIB disimpan ke Supabase Storage."
  );
}

// ─── Supabase Storage Client ──────────────────────────────────────────────────

let _supabaseModule: typeof import("@supabase/storage-js") | null = null;

async function getSupabaseModule() {
  if (!_supabaseModule) {
    _supabaseModule = await import("@supabase/storage-js");
  }
  return _supabaseModule;
}

let _client: InstanceType<typeof import("@supabase/storage-js").StorageClient> | null = null;

async function getClient() {
  if (!useSupabase) {
    throw new Error(
      "Supabase Storage tidak dikonfigurasi. " +
      "Set SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY di Replit Secrets."
    );
  }
  if (!_client) {
    const { StorageClient } = await getSupabaseModule();
    _client = new StorageClient(`${supabaseUrl}/storage/v1`, {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
    });
  }
  return _client;
}

const ensuredBuckets = new Set<string>();

async function ensureBucket(
  client: Awaited<ReturnType<typeof getClient>>,
  bucket: string,
  isPublic = true,
): Promise<void> {
  if (ensuredBuckets.has(bucket)) return;
  const { data: existing } = await client.getBucket(bucket);
  if (!existing) {
    const { error: createErr } = await client.createBucket(bucket, {
      public: isPublic,
      fileSizeLimit: 10 * 1024 * 1024,
    });
    if (createErr && !createErr.message.includes("already exists")) {
      throw new Error(`Gagal membuat bucket "${bucket}": ${createErr.message}`);
    }
  }
  ensuredBuckets.add(bucket);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function uploadToStorage(
  bucket: string,
  filename: string,
  buffer: Buffer,
  contentType: string,
  isPublic = true,
  options: { compressImage?: boolean; imageMaxDimension?: number } = {},
): Promise<string> {
  const client = await getClient();
  await ensureBucket(client, bucket, isPublic);

  const prepared =
    options.compressImage === false
      ? { buffer, contentType }
      : await compressImageForStorage(buffer, contentType, {
          maxDimension: options.imageMaxDimension,
        });

  const { data, error } = await client
    .from(bucket)
    .upload(filename, prepared.buffer, {
      contentType: prepared.contentType,
      cacheControl: prepared.contentType.startsWith("image/") ? "31536000" : undefined,
      upsert: true,
    });

  if (error) throw new Error(`Upload ke Supabase Storage gagal: ${error.message}`);

  const { data: urlData } = client.from(bucket).getPublicUrl(data.path);
  return urlData.publicUrl;
}

export async function deleteFromStorage(bucket: string, filePath: string): Promise<void> {
  if (!useSupabase) return;
  const client = await getClient();
  await client.from(bucket).remove([filePath]);
}

export function getStoragePublicUrl(bucket: string, filePath: string): string {
  if (!_client) {
    return `${supabaseUrl}/storage/v1/object/public/${bucket}/${filePath}`;
  }
  const { data } = _client.from(bucket).getPublicUrl(filePath);
  return data.publicUrl;
}

export { supabaseUrl };
