/**
 * Render engine — takes an asset + render plans, produces per-platform
 * variants stored in R2, updates media_assets.variants JSONB.
 *
 * Each plan specifies: crop, grade, overlays, watermark.
 * The engine fetches the source image once, applies transforms per
 * plan, uploads each variant to R2, and writes the variant inventory.
 */
import "server-only";
import { sql } from "@/lib/db";
import { uploadBufferToR2, keyFromStorageUrl } from "@/lib/r2";
import { cropForPlatform } from "./crops";
import { applyGrade } from "./grade";
import { applyTextOverlays, applyWatermark } from "./overlay";
import { applyStatOverlay } from "./platform-specific";
import type {
  RenderPlan,
  VariantRecord,
  VariantsMap,
  PlatformKey,
  BrandAssets,
} from "./types";

/**
 * Render one variant for a single platform plan.
 */
async function renderVariant(
  sourceBuffer: Buffer,
  plan: RenderPlan,
  logoBuffer: Buffer | null,
  assetId?: string,
): Promise<Buffer> {
  let buffer = sourceBuffer;

  // 1. Crop for platform aspect ratio
  buffer = await cropForPlatform(buffer, plan.crop);

  // 2. Color grade
  if (plan.grade !== "clean_natural") {
    buffer = await applyGrade(buffer, plan.grade);
  }

  // 3. Text overlays (headline, CTA) — filter out stat overlay marker
  const realOverlays = plan.textOverlays.filter((o) => o.text !== "__STAT_OVERLAY__");
  const hasStatMarker = plan.textOverlays.some((o) => o.text === "__STAT_OVERLAY__");

  if (realOverlays.length > 0) {
    buffer = await applyTextOverlays(buffer, realOverlays);
  }

  // 4. Stat overlay (async — needs project ID from DB)
  if (hasStatMarker && assetId) {
    const [link] = await sql`SELECT project_id FROM asset_projects WHERE asset_id = ${assetId} LIMIT 1`;
    if (link?.project_id) {
      buffer = await applyStatOverlay(buffer, String(link.project_id));
    }
  }

  // 5. Watermark
  if (plan.watermark && logoBuffer) {
    buffer = await applyWatermark(buffer, logoBuffer, plan.watermarkPosition || "bottom-right");
  }

  return buffer;
}

/**
 * Derive the R2 variant key from the source key + platform.
 * sites/{siteId}/{date}/{filename}.jpg → sites/{siteId}/{date}/{filename}--ig-4x5.jpg
 */
function variantKey(sourceKey: string, platform: PlatformKey, aspect: string): string {
  const lastDot = sourceKey.lastIndexOf(".");
  const base = lastDot > 0 ? sourceKey.slice(0, lastDot) : sourceKey;
  const shortPlatform = platform.replace("instagram_story", "ig-story").replace("instagram", "ig");
  const shortAspect = aspect.replace(":", "x");
  return `${base}--${shortPlatform}-${shortAspect}.jpg`;
}

/**
 * Fetch a URL to a buffer with timeout.
 */
async function fetchBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Main entry point: render all plans for an asset.
 *
 * 1. Fetch the source image from R2
 * 2. For each plan, run the render pipeline → upload variant to R2
 * 3. Update media_assets.variants with the variant inventory
 * 4. Set render_status = 'rendered'
 */
export async function renderAsset(
  assetId: string,
  plans: RenderPlan[],
): Promise<VariantsMap> {
  if (plans.length === 0) return {};

  const [asset] = await sql`
    SELECT ma.storage_url, ma.site_id, ma.variants,
           s.brand_assets
    FROM media_assets ma
    JOIN sites s ON s.id = ma.site_id
    WHERE ma.id = ${assetId}
  `;
  if (!asset?.storage_url) throw new Error(`Asset ${assetId} not found`);

  const storageUrl = String(asset.storage_url);
  const sourceKey = keyFromStorageUrl(storageUrl);
  if (!sourceKey) throw new Error(`Cannot parse R2 key from ${storageUrl}`);

  // Fetch source image once
  const sourceBuffer = await fetchBuffer(storageUrl);

  // Fetch logo for watermark (if any plan uses it)
  const brandAssets = (asset.brand_assets as BrandAssets) || {};
  let logoBuffer: Buffer | null = null;
  if (plans.some((p) => p.watermark) && brandAssets.logo_url) {
    try {
      logoBuffer = await fetchBuffer(brandAssets.logo_url);
    } catch {
      // No logo available — skip watermark silently
    }
  }

  // Render each plan
  const existingVariants = (asset.variants as VariantsMap) || {};
  const newVariants: VariantsMap = { ...existingVariants };

  for (const plan of plans) {
    try {
      const rendered = await renderVariant(sourceBuffer, plan, logoBuffer, assetId);
      const key = variantKey(sourceKey, plan.platform, plan.crop);
      const url = await uploadBufferToR2(key, rendered, "image/jpeg");

      const record: VariantRecord = {
        url,
        rendered_at: new Date().toISOString(),
        plan,
        size_bytes: rendered.length,
      };
      newVariants[plan.platform] = record;

      // Log to render_history
      await sql`
        INSERT INTO render_history (asset_id, platform, config, variant_url)
        VALUES (${assetId}, ${plan.platform}, ${JSON.stringify(plan)}, ${url})
      `;
    } catch (err) {
      console.error(`Render failed for ${plan.platform}:`, err instanceof Error ? err.message : err);
    }
  }

  // Update the asset
  await sql`
    UPDATE media_assets
    SET variants = ${JSON.stringify(newVariants)}::jsonb,
        render_status = 'rendered'
    WHERE id = ${assetId}
  `;

  return newVariants;
}
