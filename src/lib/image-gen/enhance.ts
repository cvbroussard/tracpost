/**
 * AI photo enhancement — replaces Lightroom post-production.
 * Runs every uploaded photo through Gemini with the site's image style
 * plus professional post-production directives.
 */

import { editEditorialImage, generateEditorialImage } from "./gemini";
import { uploadBufferToR2 } from "@/lib/r2";
import { sql } from "@/lib/db";

const QUALITY_CUTOFF = 0.7;

const POST_PRODUCTION_PROMPT = `Enhance this photograph to professional publication quality. Apply these post-production adjustments:

EXPOSURE & TONE:
- Balanced dynamic range — recover blown highlights, lift crushed shadows
- Gentle highlight compression to retain detail in bright areas
- Open up shadow detail without washing out blacks
- Preserve natural contrast — don't flatten the image

COLOR:
- Neutral warm white balance — remove any color casts
- Rich, natural color saturation without oversaturation
- Consistent skin tones if people are present
- Clean whites, true blacks

CLARITY & DETAIL:
- Micro-contrast enhancement for material textures (wood grain, metal, tile, stone)
- Subtle sharpening — crisp but not crunchy
- Noise reduction if visible, especially in shadow areas
- Clean lens correction — remove any barrel distortion or chromatic aberration

COMPOSITION:
- Keep the scene, layout, and all elements exactly as they are
- Do NOT add, remove, or rearrange any objects
- Do NOT change the camera angle or perspective
- Only enhance what the camera captured

OUTPUT STYLE:`;

/**
 * Process a media asset photo based on quality score.
 *
 * Above cutoff (0.6): ENHANCE — polish the existing photo with post-production.
 * Below cutoff (0.6): REGENERATE — use the photo as a reference to generate
 *   a production-quality "inspired by" version via AI.
 *
 * Either way, the subscriber gets a publishable hero image.
 */
export async function enhanceAssetPhoto(
  assetId: string
): Promise<string | null> {
  const [asset] = await sql`
    SELECT ma.id, ma.site_id, ma.storage_url, ma.media_type,
           ma.quality_score, ma.context_note,
           s.image_style
    FROM media_assets ma
    JOIN sites s ON s.id = ma.site_id
    WHERE ma.id = ${assetId}
  `;

  if (!asset) return null;
  if ((asset.media_type as string) !== "image") return null;

  const sourceUrl = asset.storage_url as string;
  if (!sourceUrl) return null;

  const qualityScore = (asset.quality_score as number) || 0;
  const siteStyle = (asset.image_style as string) || "Clean, editorial style. Natural lighting.";
  const contextNote = (asset.context_note as string) || "";

  let result;
  let mode: "enhanced" | "regenerated";

  if (qualityScore >= QUALITY_CUTOFF) {
    // ENHANCE — polish the existing photo
    mode = "enhanced";
    const fullPrompt = `${POST_PRODUCTION_PROMPT} ${siteStyle}`;
    result = await editEditorialImage(sourceUrl, fullPrompt);
  } else {
    // REGENERATE — use photo as reference, generate production version
    mode = "regenerated";
    result = await regenerateFromReference(sourceUrl, contextNote, siteStyle);
  }

  if (!result) return null;

  // Upload to R2
  const ext = result.mimeType.includes("png") ? "png" : "jpg";
  const key = `sites/${asset.site_id}/${mode}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
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
