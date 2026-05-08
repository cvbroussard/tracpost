import { sql } from "@/lib/db";
import sharp from "sharp";
import { createKenBurnsVideo, reformatVideo } from "@/lib/render/video";
import { uploadBufferToR2 } from "@/lib/r2";

/**
 * Variant render worker (#163, #172).
 *
 * When an asset is briefed (triage_status flips to 'triaged'), trigger
 * default-template variant rendering. The orchestrator (#168) only picks
 * assets that have a ready variant for the target template, so this
 * worker is what makes briefed assets eligible for autopilot.
 *
 * Architecture rationale:
 * - We render ON briefing (eager), not on publish (lazy). Predictable —
 *   orchestrator never gambles on a render succeeding at publish time.
 * - Default template renders synchronously here. Other templates can
 *   be rendered on subscriber request (Tools hub) or operator action.
 * - Variants gate orchestrator pool eligibility per
 *   project_tracpost_source_template_variants.md.
 *
 * Render-format default (per project_tracpost_render_format_default.md):
 * Reel-first. STILL assets default to reel_9x16 (Ken Burns motion video)
 * — single image as a Feed post is a ~1% escape hatch, Reel is ~90% of
 * what subscribers actually want their stills to become on social. The
 * algorithmic edge from Meta + TikTok prefers vertical motion format.
 *
 * Video reframing (16:9 → 9:16) currently uses center-crop via
 * reformatVideo. Mux Smart Crop upgrade is queued separately per
 * project_tracpost_video_reframing_mux.md (Layer-1 only — variant_render
 * stays the sole Mux touchpoint, R2 stays canonical).
 */

/**
 * Determine the default template for an asset based on media type.
 *
 * Per render-format-default memo:
 * - VIDEO sources → reel_9x16 (motion format that the algorithm prefers)
 * - STILL sources → reel_9x16 (Ken Burns motion turns the still into a Reel)
 * - AUDIO sources → feed_square (audiogram-style format with cover art)
 *
 * The single-image-Feed escape hatch is feed_square, but it's NOT the
 * default — subscribers can request it explicitly via the Tools hub.
 */
export function getDefaultTemplate(mediaType: string): string {
  const lower = (mediaType || "").toLowerCase();
  if (lower === "audio" || lower.startsWith("audio")) return "feed_square";
  // Both image and video default to reel_9x16. For stills, Ken Burns
  // motion produces a Reel; for video, the source is reframed to 9:16.
  return "reel_9x16";
}

export interface VariantRenderResult {
  variantId: string;
  templateId: string;
  status: "ready" | "failed" | "pending";
}

/**
 * Render the default template variant for an asset. Idempotent — if a
 * variant already exists for that template, returns it unchanged.
 *
 * Returns null on hard failure (asset not found).
 *
 * Kept for direct-template-render callers (Tools hub, Compose explicit
 * trigger). Briefing-time callers should use renderAllVariantsForAsset
 * to get all 6 template variants populated up front.
 */
export async function renderDefaultVariant(
  assetId: string,
): Promise<VariantRenderResult | null> {
  const [asset] = await sql`
    SELECT id, site_id, storage_url, media_type, triage_status
    FROM media_assets
    WHERE id = ${assetId}
  `;
  if (!asset) return null;

  const templateId = getDefaultTemplate(asset.media_type as string);
  return renderTemplateVariant(assetId, templateId);
}

/**
 * Render every applicable template variant for an asset. Called from the
 * briefing-flip handler so the asset is fully publish-ready across all
 * platforms the orchestrator might pick from.
 *
 * Per the eager-cheap / frugal-expensive policy:
 * - Image templates render in PARALLEL (sharp is fast, low memory).
 * - Video templates render SEQUENTIALLY (ffmpeg encoding is memory-heavy;
 *   serializing prevents Vercel function memory pressure).
 *
 * Skips templates that don't apply to the source media type:
 * - Audio sources only get the audiogram-style feed_square variant.
 * - Video → image templates (frame extraction) are skipped today; tracked
 *   as a follow-up. Stills get full coverage.
 *
 * Returns the array of successful render results. Failed renders are
 * captured in their own variant row's render_settings; callers can poll.
 */
export async function renderAllVariantsForAsset(
  assetId: string,
): Promise<VariantRenderResult[]> {
  const [asset] = await sql`
    SELECT id, media_type FROM media_assets WHERE id = ${assetId}
  `;
  if (!asset) return [];

  const sourceType = ((asset.media_type as string) || "").toLowerCase();
  const isAudio = sourceType.startsWith("audio");
  const isVideo = sourceType.startsWith("video");

  if (isAudio) {
    const r = await renderTemplateVariant(assetId, "feed_square");
    return r ? [r] : [];
  }

  // Image-output templates — sharp-based, parallel-safe
  const imageTemplates = ["feed_square", "feed_portrait", "pin_2x3"];
  // Video-output templates — ffmpeg-based, serialize for memory
  const videoTemplates = ["reel_9x16", "story_9x16", "long_16x9"];

  const results: VariantRenderResult[] = [];

  // Video → image template skipped pending frame extraction work; for
  // STILL sources we render all six.
  if (!isVideo) {
    const imageResults = await Promise.all(
      imageTemplates.map((t) => renderTemplateVariant(assetId, t)),
    );
    for (const r of imageResults) if (r) results.push(r);
  }

  for (const t of videoTemplates) {
    const r = await renderTemplateVariant(assetId, t);
    if (r) results.push(r);
  }

  return results;
}

/**
 * Render a specific template variant for an asset. Validates that the
 * requested template exists in asset_templates. Idempotent per (asset,
 * template) — returns the existing row if one is already rendered.
 *
 * Branches by source media type + target template, calling sharp for
 * image-output transforms and ffmpeg-based helpers (createKenBurnsVideo
 * / reformatVideo) for video-output transforms.
 */
export async function renderTemplateVariant(
  assetId: string,
  templateId: string,
): Promise<VariantRenderResult | null> {
  const [tpl] = await sql`SELECT id FROM asset_templates WHERE id = ${templateId}`;
  if (!tpl) return null;

  const [asset] = await sql`
    SELECT id, site_id, storage_url, media_type
    FROM media_assets WHERE id = ${assetId}
  `;
  if (!asset) return null;

  // Idempotency: existing ready variant short-circuits. Stale variants
  // get re-rendered (caller is markVariantsStale → re-trigger flow).
  const [existing] = await sql`
    SELECT id, variant_status FROM asset_variants
    WHERE source_asset_id = ${assetId} AND template_id = ${templateId}
  `;
  if (existing && existing.variant_status === "ready") {
    return {
      variantId: existing.id as string,
      templateId,
      status: "ready",
    };
  }

  // Mark in-progress so concurrent triggers don't double-render. If the
  // render fails, the row stays in 'pending' and the caller can retry.
  let variantId: string;
  if (existing) {
    await sql`
      UPDATE asset_variants
      SET variant_status = 'pending', generated_at = NOW()
      WHERE id = ${existing.id}
    `;
    variantId = existing.id as string;
  } else {
    const [inserted] = await sql`
      INSERT INTO asset_variants (
        source_asset_id, template_id, storage_url, render_settings,
        variant_status, generated_at
      ) VALUES (
        ${assetId}, ${templateId}, ${asset.storage_url}, '{}'::jsonb,
        'pending', NOW()
      )
      RETURNING id
    `;
    variantId = inserted.id as string;
  }

  try {
    const sourceUrl = asset.storage_url as string;
    const sourceType = (asset.media_type as string) || "";
    const siteId = asset.site_id as string;
    const isVideo = sourceType.startsWith("video");

    let outputUrl: string;
    let renderNotes: Record<string, unknown>;

    if (isVideo) {
      ({ outputUrl, renderNotes } = await renderVideoVariant(sourceUrl, templateId, siteId));
    } else {
      ({ outputUrl, renderNotes } = await renderImageVariant(sourceUrl, templateId, siteId));
    }

    await sql`
      UPDATE asset_variants
      SET storage_url = ${outputUrl},
          render_settings = ${JSON.stringify({
            ...renderNotes,
            rendered_at: new Date().toISOString(),
          })}::jsonb,
          variant_status = 'ready',
          quality_score = 1.0,
          generated_at = NOW()
      WHERE id = ${variantId}
    `;

    return { variantId, templateId, status: "ready" };
  } catch (err) {
    console.error(
      `Variant render failed (assetId=${assetId}, templateId=${templateId}):`,
      err instanceof Error ? err.message : err,
    );
    await sql`
      UPDATE asset_variants
      SET variant_status = 'failed',
          render_settings = ${JSON.stringify({
            error: err instanceof Error ? err.message : String(err),
            failed_at: new Date().toISOString(),
          })}::jsonb
      WHERE id = ${variantId}
    `;
    return { variantId, templateId, status: "failed" };
  }
}

/**
 * Image source → image-or-video target. Stills always get the Ken Burns
 * motion treatment for video templates (reel_9x16, story_9x16) and a
 * sharp-based crop for image templates (feed_square, pin_2x3, etc.).
 */
async function renderImageVariant(
  sourceUrl: string,
  templateId: string,
  siteId: string,
): Promise<{ outputUrl: string; renderNotes: Record<string, unknown> }> {
  // Video-output templates: Ken Burns motion from the still. The duration
  // is template-tuned — Reels lean longer, Stories shorter.
  if (templateId === "reel_9x16" || templateId === "story_9x16" || templateId === "long_16x9") {
    const aspect = templateId === "long_16x9" ? "16:9" : "9:16";
    const durationPerImage = templateId === "story_9x16" ? 5 : templateId === "long_16x9" ? 8 : 4;
    const url = await createKenBurnsVideo({
      imageUrls: [sourceUrl],
      outputAspect: aspect,
      durationPerImage,
      siteId,
    });
    return {
      outputUrl: url,
      renderNotes: {
        method: "ken_burns_motion",
        aspect,
        duration_seconds: durationPerImage,
        from: "image",
      },
    };
  }

  // Image-output templates: sharp-based crop with attention-aware position
  // selection. Sharp's "attention" strategy picks the most "interesting"
  // crop region rather than center — better for photos where the subject
  // isn't perfectly centered.
  const dims = templateDimensions(templateId);
  if (!dims) {
    throw new Error(`Unsupported template for image source: ${templateId}`);
  }

  const res = await fetch(sourceUrl, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Source fetch failed: ${res.status}`);
  const inputBuffer = Buffer.from(await res.arrayBuffer());

  const outputBuffer = await sharp(inputBuffer)
    .rotate() // Honor EXIF orientation
    .resize(dims.width, dims.height, {
      fit: "cover",
      position: sharp.strategy.attention,
    })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();

  const date = new Date().toISOString().slice(0, 10);
  const key = `sites/${siteId}/variants/${date}/${templateId}-${Date.now()}.jpg`;
  const url = await uploadBufferToR2(key, outputBuffer, "image/jpeg");

  return {
    outputUrl: url,
    renderNotes: {
      method: "sharp_attention_crop",
      width: dims.width,
      height: dims.height,
      from: "image",
    },
  };
}

/**
 * Video source → video target. Center-crop reframing today via
 * reformatVideo; subject-aware smart-crop is queued via Mux Smart Crop
 * (project_tracpost_video_reframing_mux.md, Layer-1 only).
 *
 * If the source aspect already matches the template aspect, the source
 * URL passes through — no re-encoding needed and no quality loss.
 */
async function renderVideoVariant(
  sourceUrl: string,
  templateId: string,
  siteId: string,
): Promise<{ outputUrl: string; renderNotes: Record<string, unknown> }> {
  const targetAspect = templateAspect(templateId);
  if (!targetAspect) {
    // Image-output template requested for a video source — extract a frame.
    // Implementation deferred; for now, fall back to source pass-through.
    return {
      outputUrl: sourceUrl,
      renderNotes: {
        method: "passthrough_video_to_image_template",
        note: "Frame extraction not yet implemented",
        from: "video",
      },
    };
  }

  const url = await reformatVideo({
    videoUrl: sourceUrl,
    targetAspect,
    siteId,
  });

  return {
    outputUrl: url,
    renderNotes: {
      method: "ffmpeg_center_crop",
      target_aspect: targetAspect,
      from: "video",
      // Mux Smart Crop upgrade tracked separately per
      // project_tracpost_video_reframing_mux.md
      smart_crop_pending_upgrade: true,
    },
  };
}

/**
 * Pixel dimensions for image-output templates. Returns null for
 * video-only templates.
 */
function templateDimensions(templateId: string): { width: number; height: number } | null {
  switch (templateId) {
    case "feed_square": return { width: 1080, height: 1080 };
    case "feed_portrait": return { width: 1080, height: 1350 };
    case "pin_2x3": return { width: 1080, height: 1620 };
    default: return null;
  }
}

/**
 * Aspect string for video-output templates. Returns null for image-only
 * templates.
 */
function templateAspect(templateId: string): "9:16" | "1:1" | "16:9" | null {
  switch (templateId) {
    case "reel_9x16":
    case "story_9x16":
      return "9:16";
    case "long_16x9":
      return "16:9";
    case "feed_square":
      return "1:1";
    default:
      return null;
  }
}

/**
 * Mark variants stale when the source asset is modified. Called from
 * the asset PATCH handler when storage_url or critical metadata changes.
 * Stale variants get re-rendered on next pool query.
 */
export async function markVariantsStale(assetId: string): Promise<number> {
  const result = await sql`
    UPDATE asset_variants
    SET variant_status = 'stale'
    WHERE source_asset_id = ${assetId} AND variant_status = 'ready'
    RETURNING id
  `;
  return result.length;
}
