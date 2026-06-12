import { StorageClient } from "@supabase/storage-js";

const supabaseUrl = process.env["SUPABASE_URL"] ?? "";
const supabaseKey = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";

let _client: StorageClient | null = null;

function getClient(): StorageClient {
  if (!_client) {
    if (!supabaseUrl || !supabaseKey) {
      throw new Error("SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY harus diset untuk file upload");
    }
    _client = new StorageClient(`${supabaseUrl}/storage/v1`, {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
    });
  }
  return _client;
}

const ensuredBuckets = new Set<string>();

async function ensureBucket(bucket: string, isPublic = true): Promise<void> {
  if (ensuredBuckets.has(bucket)) return;
  const client = getClient();
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

export async function uploadToStorage(
  bucket: string,
  filename: string,
  buffer: Buffer,
  contentType: string,
  isPublic = true,
): Promise<string> {
  const client = getClient();
  await ensureBucket(bucket, isPublic);

  const { data, error } = await client
    .from(bucket)
    .upload(filename, buffer, { contentType, upsert: true });

  if (error) throw new Error(`Upload ke storage gagal: ${error.message}`);

  const { data: urlData } = client.from(bucket).getPublicUrl(data.path);
  return urlData.publicUrl;
}

export async function deleteFromStorage(bucket: string, filePath: string): Promise<void> {
  const client = getClient();
  await client.from(bucket).remove([filePath]);
}

export function getStoragePublicUrl(bucket: string, filePath: string): string {
  const client = getClient();
  const { data } = client.from(bucket).getPublicUrl(filePath);
  return data.publicUrl;
}

export { supabaseUrl };
