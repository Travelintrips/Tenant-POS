import { StorageClient } from "@supabase/storage-js";
import sharp from "sharp";

const isProduction = process.env.NODE_ENV === "production";
const supabaseUrl = isProduction
  ? (process.env.SUPABASE_URL ?? "")
  : (process.env.SUPABASE_URL_DEV ?? process.env.SUPABASE_URL ?? "");
const supabaseKey = isProduction
  ? (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "")
  : (process.env.SUPABASE_SERVICE_ROLE_KEY_DEV ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    "");

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const allowNonProduction = args.has("--allow-non-production");
const bucketArgIndex = process.argv.indexOf("--bucket");
const requestedBucket =
  bucketArgIndex >= 0 ? process.argv[bucketArgIndex + 1] : undefined;
const maxDimensionArgIndex = process.argv.indexOf("--max-dimension");
const maxDimension = Number(
  maxDimensionArgIndex >= 0 ? process.argv[maxDimensionArgIndex + 1] : 2400,
);
const qualityArgIndex = process.argv.indexOf("--quality");
const quality = Number(
  qualityArgIndex >= 0 ? process.argv[qualityArgIndex + 1] : 82,
);
const concurrencyArgIndex = process.argv.indexOf("--concurrency");
const concurrency = Number(
  concurrencyArgIndex >= 0 ? process.argv[concurrencyArgIndex + 1] : 6,
);

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY wajib dikonfigurasi.",
  );
}
if (!Number.isInteger(maxDimension) || maxDimension < 256) {
  throw new Error("--max-dimension harus berupa angka minimal 256.");
}
if (!Number.isInteger(quality) || quality < 1 || quality > 100) {
  throw new Error("--quality harus berupa angka 1 sampai 100.");
}
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 12) {
  throw new Error("--concurrency harus berupa angka 1 sampai 12.");
}
if (!isProduction && !allowNonProduction) {
  throw new Error(
    "Script ini hanya boleh dijalankan dengan NODE_ENV=production. " +
      "Gunakan --allow-non-production jika memang disengaja.",
  );
}

const client = new StorageClient(`${supabaseUrl}/storage/v1`, {
  apikey: supabaseKey,
  Authorization: `Bearer ${supabaseKey}`,
});

const imageMimeTypes = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/tiff",
  "image/gif",
]);

function isImageFile(file) {
  const mimeType = String(file.metadata?.mimetype ?? "").toLowerCase();
  if (imageMimeTypes.has(mimeType)) return true;
  return /\.(avif|gif|jpe?g|png|tiff?|webp)$/i.test(file.name);
}

async function listFiles(bucket, prefix = "") {
  const files = [];
  const limit = 1000;

  for (let offset = 0; ; offset += limit) {
    const { data, error } = await client.from(bucket).list(prefix, {
      limit,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) {
      throw new Error(`Gagal membaca bucket "${bucket}": ${error.message}`);
    }

    for (const entry of data ?? []) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null) {
        files.push(...(await listFiles(bucket, path)));
      } else {
        files.push({ ...entry, path });
      }
    }

    if (!data || data.length < limit) break;
  }

  return files;
}

async function getBuckets() {
  if (requestedBucket) return [requestedBucket];

  const { data, error } = await client.listBuckets();
  if (error) throw new Error(`Gagal membaca daftar bucket: ${error.message}`);
  return (data ?? []).map((bucket) => bucket.name);
}

const buckets = await getBuckets();
if (buckets.length === 0) {
  console.log("Tidak ada bucket Supabase Storage yang ditemukan.");
  process.exit(0);
}

let scanned = 0;
let images = 0;
let updated = 0;
let skipped = 0;
let failed = 0;
let savedBytes = 0;

console.log(
  `${apply ? "MODE APPLY" : "MODE PREVIEW"} — bucket: ${buckets.join(", ")} — ` +
    `concurrency: ${concurrency}`,
);

async function processFile(bucket, file) {
  scanned++;
  if (!isImageFile(file)) return;
  images++;

  let data;
  try {
    const result = await client.from(bucket).download(file.path);
    if (result.error || !result.data) {
      throw new Error(result.error?.message ?? "data kosong");
    }
    data = result.data;
  } catch (error) {
    failed++;
    const message = error instanceof Error ? error.message : String(error);
    console.log(`SKIP gagal diunduh: ${bucket}/${file.path} (${message})`);
    return;
  }

  const original = Buffer.from(await data.arrayBuffer());
  let compressed;
  try {
    const metadata = await sharp(original).metadata();
    if (!metadata.format) {
      skipped++;
      console.log(`SKIP bukan gambar valid: ${bucket}/${file.path}`);
      return;
    }
    if ((metadata.pages ?? 1) > 1) {
      skipped++;
      console.log(`SKIP gambar animasi multi-page: ${bucket}/${file.path}`);
      return;
    }

    compressed = await sharp(original)
      .rotate()
      .resize(maxDimension, maxDimension, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality, effort: 4 })
      .toBuffer();
  } catch (error) {
    failed++;
    const message = error instanceof Error ? error.message : String(error);
    console.log(`SKIP gagal diproses: ${bucket}/${file.path} (${message})`);
    return;
  }

  const saved = original.length - compressed.length;
  if (saved <= 0) {
    skipped++;
    console.log(
      `SKIP tidak lebih kecil: ${bucket}/${file.path} ` +
        `(${original.length} -> ${compressed.length} bytes)`,
    );
    return;
  }

  if (apply) {
    try {
      const { error: updateError } = await client
        .from(bucket)
        .update(file.path, compressed, {
          contentType: "image/webp",
          cacheControl: "31536000",
        });
      if (updateError) {
        // Beberapa object lama dapat menolak PUT update karena metadata lama.
        // Upload upsert tetap mempertahankan path/URL yang sama.
        const { error: replaceError } = await client
          .from(bucket)
          .upload(file.path, compressed, {
            contentType: "image/webp",
            cacheControl: "31536000",
            upsert: true,
          });
        if (replaceError) {
          throw new Error(
            `update: ${updateError.message}; upload: ${replaceError.message}`,
          );
        }
      }
    } catch (error) {
      failed++;
      const message = error instanceof Error ? error.message : String(error);
      console.log(`GAGAL update: ${bucket}/${file.path} (${message})`);
      return;
    }
  }

  updated++;
  savedBytes += saved;
  console.log(
    `${apply ? "UPDATED" : "WOULD UPDATE"} ${bucket}/${file.path}: ` +
      `${original.length} -> ${compressed.length} bytes`,
  );
}

for (const bucket of buckets) {
  const files = await listFiles(bucket);
  for (let i = 0; i < files.length; i += concurrency) {
    await Promise.all(
      files.slice(i, i + concurrency).map((file) => processFile(bucket, file)),
    );
  }
}

console.log(
  JSON.stringify(
    {
      scanned,
      images,
      updated,
      skipped,
      failed,
      savedBytes,
      mode: apply ? "apply" : "preview",
    },
    null,
    2,
  ),
);