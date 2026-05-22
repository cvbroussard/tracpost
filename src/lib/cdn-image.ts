/**
 * Cloudflare Image Resizing URL builder.
 *
 * assets.tracpost.com is an R2 custom domain on Cloudflare's edge, so any
 * image on it can be resized on the fly by inserting a
 * /cdn-cgi/image/<options>/ segment after the host. The first request at a
 * given size generates + edge-caches that variant; later requests are
 * cache hits — no pre-generation, no extra R2 storage, no backfill.
 *
 * Two entry points:
 *  - cdnImage()       — display path. Gated by NEXT_PUBLIC_CDN_IMAGE_RESIZING
 *                       so it can ship ahead of the dashboard toggle; a
 *                       pass-through while the flag is off.
 *  - cdnImageForced() — always on. For server-side callers that need a hard
 *                       size guarantee regardless of the display rollout —
 *                       e.g. capping an image under an LLM API's per-image
 *                       byte limit. Image Resizing must be live on the zone.
 *
 * Both rewrite only assets.tracpost.com image URLs; external hosts, blob
 * URLs and already-transformed URLs pass through untouched. Not for video —
 * Image Resizing transforms images only.
 */
const ASSET_HOST = "https://assets.tracpost.com/";
const ENABLED = process.env.NEXT_PUBLIC_CDN_IMAGE_RESIZING === "true";

export interface CdnImageOptions {
  width?: number;
  height?: number;
  /** 1–100; defaults to 75. */
  quality?: number;
  /** "cover" (default) crops to fill the box; "contain"/"scale-down" fit inside. */
  fit?: "cover" | "contain" | "scale-down";
  /** Output format; defaults to "auto" (WebP/AVIF negotiated by Accept header). */
  format?: "auto" | "jpeg" | "webp" | "png";
}

/**
 * Build a /cdn-cgi/image/ transform URL. Non-asset-host URLs and
 * already-transformed URLs are returned untouched.
 */
function buildCdnUrl(url: string, opts: CdnImageOptions): string {
  if (!url.startsWith(ASSET_HOST) || url.includes("/cdn-cgi/image/")) return url;

  const key = url.slice(ASSET_HOST.length);
  const params = [
    `format=${opts.format ?? "auto"}`,
    `fit=${opts.fit ?? "cover"}`,
    opts.width ? `width=${opts.width}` : "",
    opts.height ? `height=${opts.height}` : "",
    `quality=${opts.quality ?? 75}`,
  ]
    .filter(Boolean)
    .join(",");

  return `${ASSET_HOST}cdn-cgi/image/${params}/${key}`;
}

/**
 * Display-path resizer — gated by NEXT_PUBLIC_CDN_IMAGE_RESIZING. Returns
 * the original URL untouched while the flag is off.
 */
export function cdnImage(
  url: string | null | undefined,
  opts: CdnImageOptions = {},
): string {
  if (!url) return "";
  if (!ENABLED) return url;
  return buildCdnUrl(url, opts);
}

/**
 * Always-on resizer — NOT gated on the display flag. For server-side
 * callers that must guarantee a bounded image size (e.g. staying under
 * Claude's 5 MB per-image limit). Requires Image Resizing live on the zone.
 */
export function cdnImageForced(
  url: string | null | undefined,
  opts: CdnImageOptions = {},
): string {
  if (!url) return "";
  return buildCdnUrl(url, opts);
}

/**
 * Always-on aspect-crop for video-producer inputs. Center-crops the
 * source to the requested aspect via Cloudflare cover-fit, returning
 * a JPEG URL ready to hand to Kling / Runway / Veo / etc.
 *
 * Why this exists: every image-to-video producer derives its output
 * aspect from the input image (Kling outright ignores aspect_ratio
 * when an image is provided; Veo letterboxes a mismatched source
 * inside the requested canvas). Pre-cropping the source removes that
 * surprise — the producer always sees a frame already in the target
 * shape, so frame 1 == requested aspect.
 *
 * Subject-aware crop (Smart Rotate, #176) is the future upgrade for
 * cases where the subject isn't centred; until then, centre crop is
 * the v1 and is a pure derivation — no storage, no media_components
 * row, just a CDN URL.
 */
export function cdnImageCroppedToAspect(
  url: string | null | undefined,
  aspect: "16:9" | "9:16",
  quality: number = 90,
): string {
  if (!url) return "";
  const dims =
    aspect === "16:9"
      ? { width: 1280, height: 720 }
      : { width: 720, height: 1280 };
  return cdnImageForced(url, { ...dims, fit: "cover", format: "jpeg", quality });
}
