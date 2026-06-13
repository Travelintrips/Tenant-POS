import path from "path";
import fs from "fs";

const supabaseUrl = process.env["SUPABASE_URL"] ?? "";
const supabaseKey = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";

const useSupabase = Boolean(supabaseUrl && supabaseKey);

// ─── Local disk storage (fallback when Supabase is not configured) ────────────

function uploadsRoot(): string {
  return path.join(process.cwd(), "uploads");
}

async function saveLocal(
  bucket: string,
  filename: string,
  buffer: Buffer,
): Promise<string> {
  const dir = path.join(uploadsRoot(), bucket);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), buffer);
  return `/uploads/${bucket}/${filename}`;
}

// ─── Supabase storage (when credentials are present) ────────────────────────

let _supabaseModule: typeof import("@supabase/storage-js") | null = null;

async function getSupabaseModule() {
  if (!_supabaseModule) {
    _supabaseModule = await import("@supabase/storage-js");
  }
  return _supabaseModule;
}

let _client: InstanceType<typeof import("@supabase/storage-js").StorageClient> | null = null;

async function getClient() {
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

async function ensureBucket(client: Awaited<ReturnType<typeof getClient>>, bucket: string, isPublic = true): Promise<void> {
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
): Promise<string> {
  if (!useSupabase) {
    return saveLocal(bucket, filename, buffer);
  }

  const client = await getClient();
  await ensureBucket(client, bucket, isPublic);

  const { data, error } = await client
    .from(bucket)
    .upload(filename, buffer, { contentType, upsert: true });

  if (error) throw new Error(`Upload ke storage gagal: ${error.message}`);

  const { data: urlData } = client.from(bucket).getPublicUrl(data.path);
  return urlData.publicUrl;
}

export async function deleteFromStorage(bucket: string, filePath: string): Promise<void> {
  if (!useSupabase) {
    const localPath = path.join(uploadsRoot(), bucket, path.basename(filePath));
    try { fs.unlinkSync(localPath); } catch { /* ignore */ }
    return;
  }
  const client = await getClient();
  await client.from(bucket).remove([filePath]);
}

export function getStoragePublicUrl(bucket: string, filePath: string): string {
  if (!useSupabase) {
    return `/uploads/${bucket}/${filePath}`;
  }
  if (!_client) return `/uploads/${bucket}/${filePath}`;
  const { data } = _client.from(bucket).getPublicUrl(filePath);
  return data.publicUrl;
}

export { supabaseUrl };
