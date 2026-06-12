import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

let _client: SupabaseClient | null = null;

function createSupabaseClient(): SupabaseClient | null {
  if (_client) return _client;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    realtime: { params: { eventsPerSecond: 10 } },
  });
  return _client;
}

export function getSupabaseClient(): SupabaseClient | null {
  return createSupabaseClient();
}

export async function uploadFileToSupabase(
  bucket: string,
  path: string,
  file: File | Blob,
  contentType?: string,
): Promise<string> {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase client tidak tersedia");

  const { data, error } = await client.storage
    .from(bucket)
    .upload(path, file, {
      contentType: contentType ?? file.type ?? "application/octet-stream",
      upsert: true,
    });

  if (error) throw new Error(`Upload gagal: ${error.message}`);

  const { data: urlData } = client.storage.from(bucket).getPublicUrl(data.path);
  return urlData.publicUrl;
}

export async function deleteFileFromSupabase(bucket: string, path: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase client tidak tersedia");
  await client.storage.from(bucket).remove([path]);
}

export function getPublicUrl(bucket: string, path: string): string | null {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data } = client.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

export const supabaseUrl = SUPABASE_URL ?? "";
export const isSupabaseConfigured = !!(SUPABASE_URL && SUPABASE_ANON_KEY);
