import sharp from "sharp";
import exifReader from "exif-reader";
// @ts-expect-error — no type declarations for heic-convert
import convert from "heic-convert";

/**
 * Convert an image buffer to JPEG if it's HEIC/HEIF or other non-web format.
 * Returns the original buffer if already JPEG/PNG/WebP.
 */
export async function ensureWebFormat(
  buffer: Buffer,
  mimeType: string
): Promise<{ data: Buffer; mimeType: string }> {
  // HEIC/HEIF — use heic-convert (pure JS, no native deps)
  if (mimeType === "image/heic" || mimeType === "image/heif") {
    const output = await convert({
      buffer,
      format: "JPEG",
      quality: 0.9,
    });
    return { data: Buffer.from(output), mimeType: "image/jpeg" };
  }

  // TIFF/BMP — use sharp
  const needsConversion = mimeType === "image/tiff" || mimeType === "image/bmp";
  if (!needsConversion) {
    return { data: buffer, mimeType };
  }

  const converted = await sharp(buffer)
    .keepMetadata()
    .jpeg({ quality: 90 })
    .toBuffer();
  return { data: converted, mimeType: "image/jpeg" };
}

export interface ExifData {
  dateTaken: string | null;
  lat: number | null;
  lng: number | null;
  camera: string | null;
}

/**
 * Extract EXIF metadata from an image URL.
 * Returns date taken, GPS coordinates, and camera info.
 */
export async function extractExif(url: string): Promise<ExifData> {
  const result: ExifData = { dateTaken: null, lat: null, lng: null, camera: null };

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return result;

    const buffer = Buffer.from(await res.arrayBuffer());
    const metadata = await sharp(buffer).metadata();
    if (!metadata.exif) return result;

    const exif = exifReader(metadata.exif) as unknown as Record<string, Record<string, unknown>>;

    // Date taken — exif-reader uses capitalized keys: Image, Photo, GPSInfo
    const photo = exif.Photo || exif.exif || {};
    const image = exif.Image || exif.image || {};
    const dateOriginal = photo.DateTimeOriginal as Date | string | undefined;
    const dateDigitized = photo.DateTimeDigitized as Date | string | undefined;
    const dateTime = image.DateTime as Date | string | undefined;
    const rawDate = dateOriginal || dateDigitized || dateTime;
    if (rawDate) {
      const date = rawDate instanceof Date ? rawDate : new Date(rawDate);
      if (!isNaN(date.getTime()) && date.getFullYear() >= 2000 && date <= new Date()) {
        result.dateTaken = date.toISOString();
      }
    }

    // GPS coordinates — exif-reader uses GPSInfo key, lat/lng as DMS arrays [degrees, minutes, seconds]
    const gps = (exif.GPSInfo || exif.gps || {}) as Record<string, unknown>;
    if (gps.GPSLatitude && gps.GPSLongitude) {
      const latDms = gps.GPSLatitude as number[];
      const lngDms = gps.GPSLongitude as number[];
      const latRef = (gps.GPSLatitudeRef as string) || "N";
      const lngRef = (gps.GPSLongitudeRef as string) || "E";

      // Convert DMS array to decimal, or use directly if already decimal
      const lat = Array.isArray(latDms) ? latDms[0] + latDms[1] / 60 + (latDms[2] || 0) / 3600 : latDms as unknown as number;
      const lng = Array.isArray(lngDms) ? lngDms[0] + lngDms[1] / 60 + (lngDms[2] || 0) / 3600 : lngDms as unknown as number;

      result.lat = latRef === "S" ? -lat : lat;
      result.lng = lngRef === "W" ? -lng : lng;
    }

    // Camera
    const make = (image.Make as string) || "";
    const model = (image.Model as string) || "";
    if (make || model) {
      result.camera = [make, model].filter(Boolean).join(" ").trim();
    }

    return result;
  } catch {
    return result;
  }
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

/**
 * Get image dimensions from a buffer using sharp.
 */
export async function imageDimensions(buffer: Buffer): Promise<{ width: number; height: number } | null> {
  try {
    const metadata = await sharp(buffer).metadata();
    if (metadata.width && metadata.height) {
      return { width: metadata.width, height: metadata.height };
    }
    return null;
  } catch {
    return null;
  }
}
