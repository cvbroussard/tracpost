/**
 * Cloudflare Image Resizing URL builder.
 *
 * assets.tracpost.com is an R2 custom domain on Cloudflare's edge, so any
 * image on it can be resized on the fly by inserting a
 * /cdn-cgi/image/<options>/ segment after the host. The first request at a
 * given size generates + edge-caches that variant; later requests are
 * cache hits — no pre-generation, no extra R2 storage, no backfill.
 *
 * Gated by NEXT_PUBLIC_CDN_IMAGE_RESIZING: this ships with the flag off, so
 * cdnImage() is a pass-through and grids keep serving originals. Enable
 * "Image Resizing" on the Cloudflare zone, then set the flag to "true" —
 * one coordinated switch, no risk of /cdn-cgi/image/ URLs resolving before
 * the feature is live.
 *
 * Only rewrites assets.tracpost.com image URLs; external hosts, blob URLs
 * and already-transformed URLs are returned untouched. Not for video —
 * Image Resizing transforms images only.
 */
const ASSET_HOST = "https://assets.tracpost.com/";
const ENABLED = process.env.NEXT_PUBLIC_CDN_IMAGE_RESIZING === "true";

export interface CdnImageOptions {
  width?: number;
  height?: number;
  /** 1–100; defaults to 75. */
  quality?: number;
  /** "cover" (default) crops to fill the box; "contain" fits inside. */
  fit?: "cover" | "contain" | "scale-down";
}

export function cdnImage(
  url: string | null | undefined,
  opts: CdnImageOptions = {},
): string {
  if (!url) return "";
  if (!ENABLED) return url;
  if (!url.startsWith(ASSET_HOST) || url.includes("/cdn-cgi/image/")) return url;

  const key = url.slice(ASSET_HOST.length);
  const params = [
    "format=auto",
    `fit=${opts.fit ?? "cover"}`,
    opts.width ? `width=${opts.width}` : "",
    opts.height ? `height=${opts.height}` : "",
    `quality=${opts.quality ?? 75}`,
  ]
    .filter(Boolean)
    .join(",");

  return `${ASSET_HOST}cdn-cgi/image/${params}/${key}`;
}
