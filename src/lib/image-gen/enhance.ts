/**
 * AI photo enhancement — replaces Lightroom post-production.
 * Runs every uploaded photo through Gemini with the site's image style
 * plus professional post-production directives.
 */

import { editEditorialImage, generateEditorialImage } from "./gemini";
import { uploadBufferToR2 } from "@/lib/r2";
import { sql } from "@/lib/db";
import { seoFilename } from "@/lib/seo-filename";

const QUALITY_CUTOFF = 0.7;

const POST_PRODUCTION_PROMPT = `Apply ONLY technical photo corrections to this image. This is post-production, NOT creative editing.

EXPOSURE & TONE:
- Balanced dynamic range — recover blown highlights, lift crushed shadows
- Gentle highlight compression to retain detail in bright areas
- Open up shadow detail without washing out blacks
- Preserve natural contrast — don't flatten the image

COLOR:
- Neutral warm white balance — remove any color casts
- Rich, natural color saturation without oversaturation
- Clean whites, true blacks

CLARITY & DETAIL:
- Micro-contrast enhancement for material textures (wood grain, metal, tile, stone)
- Subtle sharpening — crisp but not crunchy
- Noise reduction if visible, especially in shadow areas

STRICT RULES — DO NOT VIOLATE:
- Do NOT add any objects (no dishes, no decor, no staging, no props)
- Do NOT remove any objects (construction materials, tools, debris stay)
- Do NOT advance the construction state — if something is unfinished, leave it unfinished
- Do NOT change the scene composition, perspective, or framing
- Do NOT reimagine or restage the photo
- ONLY adjust lighting, color, exposure, and sharpness`;

/**
 * Process a media asset photo based on quality score.
 *
 * Three site-level modes:
 * - "auto": quality gate — enhance above 0.7, regenerate below
 * - "enhance": always enhance, never regenerate (authenticity-first brands)
 * - "off": no processing, raw uploads published as-is
 */
export async function enhanceAssetPhoto(
  assetId: string
): Promise<string | null> {
  const [asset] = await sql`
    SELECT ma.id, ma.site_id, ma.storage_url, ma.media_type,
           ma.quality_score, ma.context_note, ma.metadata, ma.ai_analysis,
           s.image_style, s.image_processing_mode
    FROM media_assets ma
    JOIN sites s ON s.id = ma.site_id
    WHERE ma.id = ${assetId}
  `;

  if (!asset) return null;
  if ((asset.media_type as string) !== "image") return null;

  const processingMode = (asset.image_processing_mode as string) || "auto";
  if (processingMode === "off") return null;

  // Return existing enhanced URL if already processed
  const assetMeta = (asset.metadata || {}) as Record<string, unknown>;
  const existingEnhanced = assetMeta.enhanced_url || assetMeta.regenerated_url;
  if (existingEnhanced) return existingEnhanced as string;

  const sourceUrl = asset.storage_url as string;
  if (!sourceUrl) return null;

  const qualityScore = (asset.quality_score as number) || 0;
  const siteStyle = (asset.image_style as string) || "Clean, editorial style. Natural lighting.";
  // Use context note, or auto-generated context, or vision description for filename
  const aiAnalysis = (asset.ai_analysis || {}) as Record<string, unknown>;
  const contextNote = (asset.context_note as string)
    || (aiAnalysis.context_note as string)
    || (aiAnalysis.description as string)
    || "";

  let result;
  let mode: "enhanced" | "regenerated";

  if (processingMode === "enhance" || qualityScore >= QUALITY_CUTOFF) {
    // ENHANCE — technical post-production only, NO style overlay
    mode = "enhanced";
    result = await editEditorialImage(sourceUrl, POST_PRODUCTION_PROMPT);
  } else {
    // REGENERATE — use photo as reference, generate production version
    mode = "regenerated";
    result = await regenerateFromReference(sourceUrl, contextNote, siteStyle);
  }

  if (!result) return null;

  // Upload to R2
  const ext = result.mimeType.includes("png") ? "png" : "jpg";
  const fname = seoFilename(contextNote || "enhanced-photo", ext);
  const key = `sites/${asset.site_id}/media/${fname}`;
  const newUrl = await uploadBufferToR2(key, result.data, result.mimeType);

  // Store new URL on the asset — keep original in metadata
  await sql`
    UPDATE media_assets
    SET metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({
      [`${mode}_url`]: newUrl,
      original_url: sourceUrl,
      hero_mode: mode,
      quality_score_at_processing: qualityScore,
    })}::jsonb
    WHERE id = ${assetId}
  `;

  return newUrl;
}

/**
 * Generate a production-quality image inspired by a low-quality reference photo.
 * Sends the reference photo + context note to Gemini as a scene description,
 * producing a new image that captures the same subject matter at catalog quality.
 */
async function regenerateFromReference(
  referenceUrl: string,
  contextNote: string,
  siteStyle: string
): Promise<{ data: Buffer; mimeType: string } | null> {
  // First, try edit mode with heavy enhancement — sometimes this is enough
  const editResult = await editEditorialImage(
    referenceUrl,
    `Dramatically improve this photograph to professional publication quality. Fix all exposure, lighting, color, and clarity issues. Remove any construction debris, tools, or staging items that aren't part of the finished space. ${siteStyle}`
  );
  if (editResult) return editResult;

  // If edit fails (image too degraded), generate a new image inspired by the context
  if (contextNote) {
    return generateEditorialImage(
      `Professional photograph of: ${contextNote}. ${siteStyle}`,
      "16:9"
    );
  }

  return null;
}
