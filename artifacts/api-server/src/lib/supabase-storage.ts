import { StorageClient } from "@supabase/storage-js";

const isDev = (process.env["NODE_ENV"] ?? "development") !== "production";

const supabaseUrl = isDev
  ? (process.env["SUPABASE_URL_DEV"] ?? process.env["SUPABASE_URL"] ?? "")
  : (process.env["SUPABASE_URL"] ?? "");

const supabaseKey = isDev
  ? (process.env["SUPABASE_SERVICE_ROLE_KEY_DEV"] ?? process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "")
  : (process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "");

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

async function ensureBucket(bucket: string): Promise<void> {
  const client = getClient();
  const { data: existing, error } = await client.getBucket(bucket);
  if (!existing || error) {
    const isPublic = true;
    const { error: createErr } = await client.createBucket(bucket, {
      public: isPublic,
      fileSizeLimit: 5 * 1024 * 1024,
    });
    if (createErr && !createErr.message.includes("already exists")) {
      throw new Error(`Gagal membuat bucket "${bucket}": ${createErr.message}`);
    }
  }
}

export async function uploadToStorage(
  bucket: string,
  filename: string,
  buffer: Buffer,
  contentType: string,
): Promise<string> {
  const client = getClient();

  if (!ensuredBuckets.has(bucket)) {
    await ensureBucket(bucket);
    ensuredBuckets.add(bucket);
  }

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
