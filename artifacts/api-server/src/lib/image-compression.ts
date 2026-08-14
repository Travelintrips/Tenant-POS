const DEFAULT_MAX_DIMENSION = 2400;
const DEFAULT_QUALITY = 82;

export interface ImageCompressionOptions {
  maxDimension?: number;
  quality?: number;
}

export interface ImageCompressionResult {
  buffer: Buffer;
  contentType: string;
  compressed: boolean;
  originalSize: number;
}

/**
 * Normalize uploaded images into reasonably sized WebP files.
 *
 * The input MIME type is checked before loading sharp so documents such as
 * PDFs and HTML receipts are passed through untouched. `rotate()` applies the
 * EXIF orientation before the metadata is removed by the WebP conversion.
 */
export async function compressImageForStorage(
  buffer: Buffer,
  contentType: string,
  options: ImageCompressionOptions = {},
): Promise<ImageCompressionResult> {
  if (!contentType.toLowerCase().startsWith("image/")) {
    return { buffer, contentType, compressed: false, originalSize: buffer.length };
  }

  const sharp = (await import("sharp")).default;
  const maxDimension = options.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const quality = options.quality ?? DEFAULT_QUALITY;

  const compressed = await sharp(buffer)
    .rotate()
    .resize(maxDimension, maxDimension, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality, effort: 4 })
    .toBuffer();

  return {
    buffer: compressed,
    contentType: "image/webp",
    compressed: true,
    originalSize: buffer.length,
  };
}