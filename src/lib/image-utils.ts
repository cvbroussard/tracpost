import sharp from "sharp";

/**
 * Convert an image buffer to JPEG if it's HEIC/HEIF or other non-web format.
 * Returns the original buffer if already JPEG/PNG/WebP.
 */
export async function ensureWebFormat(
  buffer: Buffer,
  mimeType: string
): Promise<{ data: Buffer; mimeType: string }> {
  const needsConversion =
    mimeType === "image/heic" ||
    mimeType === "image/heif" ||
    mimeType === "image/tiff" ||
    mimeType === "image/bmp";

  if (!needsConversion) {
    return { data: buffer, mimeType };
  }

  const converted = await sharp(buffer)
    .jpeg({ quality: 90 })
    .toBuffer();

  return { data: converted, mimeType: "image/jpeg" };
}

/**
 * Convert an image from a URL to web-safe format if needed.
 * Downloads, converts if HEIC/HEIF, returns buffer + mime type.
 */
export async function fetchAndConvert(
  url: string
): Promise<{ data: Buffer; mimeType: string }> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);

  const buffer = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") || "image/jpeg";

  return ensureWebFormat(buffer, contentType);
}
