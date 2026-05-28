import { sql } from "@/lib/db";
import { fetchAndConvert } from "@/lib/image-utils";
import { uploadBufferToR2, deleteObjectFromR2, keyFromStorageUrl } from "@/lib/r2";
import { seoFilename } from "@/lib/seo-filename";

/**
 * Convert a HEIC/HEIF asset to JPEG and update the DB row.
 *
 * Per the upload-pipeline cleanup (2026-05-09): HEIC conversion runs inline
 * via waitUntil at upload time (not deferred to pipeline/process). Browsers
 * don't render HEIC, so the asset is unbriefable until conversion finishes.
 *
 * Steps:
 *   1. Fetch HEIC bytes from R2
 *   2. Decode + re-encode as JPEG via sharp/heic-decode
 *   3. Upload JPEG to R2 with throwaway key (slug rename happens at briefing)
 *   4. Update storage_url, mark briefable_at, drop needs_conversion flag
 *   5. Delete the original HEIC bytes
 *
 * Idempotent: if the asset's storage_url already isn't HEIC, returns no-op.
 * Throws on conversion failure — caller decides whether to surface to UI.
 */
export async function convertHeicAsset(assetId: string): Promise<{
  ok: boolean;
  converted: boolean;
  newUrl: string | null;
}> {
  const [asset] = await sql`
    SELECT id, business_id, storage_url, metadata
    FROM media_assets
    WHERE id = ${assetId}
  `;
  if (!asset) {
    return { ok: false, converted: false, newUrl: null };
  }

  const storageUrl = asset.storage_url as string;
  const isHeic = storageUrl.toLowerCase().endsWith(".heic") || storageUrl.toLowerCase().endsWith(".heif");
  if (!isHeic) {
    // Already converted (or never was HEIC); just stamp briefable_at.
    await sql`
      UPDATE media_assets
      SET briefable_at = COALESCE(briefable_at, NOW())
      WHERE id = ${assetId}
    `;
    return { ok: true, converted: false, newUrl: storageUrl };
  }

  const siteId = asset.business_id as string;
  const meta = (asset.metadata || {}) as Record<string, unknown>;
  const originalFilename = (meta.original_filename as string) || "upload";

  const { data, mimeType } = await fetchAndConvert(storageUrl);
  const date = new Date().toISOString().slice(0, 10);
  const fname = seoFilename(originalFilename.replace(/\.(heic|heif)$/i, ""), "jpg");
  const key = `sites/${siteId}/${date}/${fname}`;
  const newUrl = await uploadBufferToR2(key, data, mimeType);

  await sql`
    UPDATE media_assets
    SET storage_url = ${newUrl},
        briefable_at = NOW(),
        metadata = (COALESCE(metadata, '{}'::jsonb) - 'needs_conversion')
                   || '{"converted": true}'::jsonb,
        updated_at = NOW()
    WHERE id = ${assetId}
  `;

  // Delete the original HEIC bytes — non-fatal if cleanup fails (R2 just
  // ends up with a dangling object until eventual sweep).
  const heicKey = keyFromStorageUrl(storageUrl);
  if (heicKey) {
    try {
      await deleteObjectFromR2(heicKey);
    } catch (err) {
      console.warn(
        "HEIC cleanup failed (non-fatal):",
        err instanceof Error ? err.message : err,
      );
    }
  }

  return { ok: true, converted: true, newUrl };
}
