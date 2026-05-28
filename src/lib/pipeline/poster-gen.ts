import { sql } from "@/lib/db";
import { generateThumbnail } from "@/lib/render/video";

/**
 * Auto-generate a poster image for a video asset.
 *
 * Per design lock 2026-05-08: every uploaded video gets a poster
 * extracted via ffmpeg at the 1-second mark. The poster:
 *
 * 1. Becomes the canonical thumbnail in Unifeed cards + asset library
 * 2. Gives AI vision a real image to analyze (instead of the heuristic
 *    fallback we used to take for videos)
 * 3. Is supplied as the explicit cover image when publishing to platforms
 *    that accept one (Meta, IG, TikTok, etc.)
 * 4. Lets the v2 generator render the poster as a static hero alongside
 *    the video element in articles
 *
 * Idempotent: if `poster_asset_id` is already set on the source asset,
 * returns the existing value. Designed to be wrapped in `waitUntil` from
 * the upload POST handler so the API response returns immediately.
 *
 * Returns the poster asset's id, or null when not applicable / fails.
 */
export async function generatePosterForAsset(
  sourceAssetId: string,
): Promise<string | null> {
  const [asset] = await sql`
    SELECT id, business_id, storage_url, media_type, poster_asset_id
    FROM media_assets
    WHERE id = ${sourceAssetId}
  `;
  if (!asset) return null;

  const mediaType = (asset.media_type as string) || "";
  if (!mediaType.toLowerCase().startsWith("video")) {
    return null; // Not a video — nothing to do
  }

  if (asset.poster_asset_id) {
    return asset.poster_asset_id as string; // Already generated
  }

  const sourceUrl = asset.storage_url as string;
  const siteId = asset.business_id as string;

  let posterUrl: string;
  try {
    posterUrl = await generateThumbnail(sourceUrl, siteId);
  } catch (err) {
    console.warn(
      "Poster generation failed (non-fatal — asset stays without poster):",
      err instanceof Error ? err.message : err,
    );
    return null;
  }

  // Insert a new media_assets row for the poster image. The poster is a
  // first-class asset (so other surfaces can reference it cleanly) but
  // marked auto-generated so it doesn't pollute the subscriber library
  // or the orchestrator pool.
  const [posterAsset] = await sql`
    INSERT INTO media_assets (
      business_id, storage_url, media_type, source,
      processing_stage, sort_order, metadata
    )
    VALUES (
      ${siteId}, ${posterUrl}, 'image/jpeg', 'video_poster',
      'onboarded', EXTRACT(EPOCH FROM NOW()),
      ${JSON.stringify({
        role: "poster",
        source_video_asset_id: sourceAssetId,
        auto_generated: true,
        generated_at: new Date().toISOString(),
        extraction_method: "ffmpeg_1s_mark",
      })}
    )
    RETURNING id
  `;

  const posterAssetId = posterAsset.id as string;

  // Wire the poster to its source video and stamp the source as briefable.
  // Per migration #103: a video without a poster has no preview frame for
  // the subscriber to brief against, so briefable_at gates the modal until
  // the poster lands. Coalesce — if briefed-on-upload already set it via
  // processBriefedAsset, don't clobber.
  await sql`
    UPDATE media_assets
    SET poster_asset_id = ${posterAssetId},
        briefable_at = COALESCE(briefable_at, NOW()),
        updated_at = NOW()
    WHERE id = ${sourceAssetId}
  `;

  return posterAssetId;
}
