import { sql } from "@/lib/db";
import sharp from "sharp";
import { createKenBurnsVideo, reformatVideo } from "@/lib/render/video";
import { uploadBufferToR2 } from "@/lib/r2";
import { isSmartRotateEnabled, callSmartRotate, smartRotateDimsForTemplate } from "./smart-rotate-client";
import { isEnterpriseTier } from "./site-tier";
import { extractSlugFromSourceUrl, deriveVariantKey } from "./asset-keys";
import {
  applyFaceTransforms,
  checkSuppressGate,
  resolveFacePolicy,
  type DetectedFaceBox,
  type EffectiveFacePolicy,
} from "@/lib/privacy/face-transforms";
import {
  directShot,
  DIRECTOR_TEMPLATE_SPECS,
  type DirectorTemplate,
} from "@/lib/video-gen/director";
import { generateVideoFromImage } from "@/lib/video-gen/kling";
import {
  gatherDirectorContext,
  type DirectorContext,
} from "@/lib/video-gen/director-context";

/** Templates that produce video output. Stills targeting one of these
 * go through the Director Call → Producer Call (Kling) path; everything
 * else is a sharp image crop. */
const VIDEO_OUTPUT_TEMPLATES = new Set<string>(["reel_9x16", "story_9x16", "long_16x9"]);

/**
 * Variant render worker (#163, #172).
 *
 * When an asset is briefed (processing_stage flips to 'briefed'), trigger
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
    SELECT id, site_id, storage_url, media_type, processing_stage
    FROM media_assets
    WHERE id = ${assetId}
  `;
  if (!asset) return null;

  const templateId = getDefaultTemplate(asset.media_type as string);
  return renderTemplateVariant(assetId, templateId);
}

/**
 * Whole-asset variant rendering is orchestrated by the render-variants
 * route (`/api/assets/[id]/render-variants`), NOT a single function
 * here. The route self-chains — one video template per Vercel
 * invocation — because each video template runs a Director Call + Kling
 * Producer Call that can poll for minutes; three serial Kling renders
 * in one invocation would blow the 300s budget. `renderTemplateVariant`
 * below is the single-template primitive the route drives.
 */

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
    SELECT ma.id, ma.site_id, ma.storage_url, ma.media_type, ma.metadata,
           s.face_policy, s.face_waiver_signed_at,
           s.minor_face_policy, s.minor_face_waiver_signed_at
    FROM media_assets ma JOIN sites s ON s.id = ma.site_id
    WHERE ma.id = ${assetId}
  `;
  if (!asset) return null;

  // Resolve both effective face policies (adult + minor). Each face in
  // the asset is routed to one of them based on is_potential_minor
  // (set by face-detect.ts when AgeRange.Low < 18).
  //
  // Suppress short-circuits BEFORE we create a variant row — no need
  // to track suppressed renders. Orchestrator pool query already filters
  // on "has-ready-variant" so absent variants naturally exclude the
  // asset. Suppress is asset-level (any face in the suppress group
  // blocks the entire render) — see checkSuppressGate docs.
  const assetMetadata = (asset.metadata as Record<string, unknown> | null) || {};
  const faceDetection = assetMetadata.face_detection as
    | { faces?: DetectedFaceBox[]; face_count?: number }
    | undefined;
  const detectedFaces = faceDetection?.faces || [];
  const adultFacePolicy: EffectiveFacePolicy = resolveFacePolicy(
    (asset.face_policy as string) || "blur",
    (asset.face_waiver_signed_at as Date | string | null) || null,
  );
  const minorFacePolicy: EffectiveFacePolicy = resolveFacePolicy(
    (asset.minor_face_policy as string) || "blur",
    (asset.minor_face_waiver_signed_at as Date | string | null) || null,
  );

  const suppressReason = checkSuppressGate(detectedFaces, adultFacePolicy, minorFacePolicy);
  if (suppressReason) {
    console.log(
      `Variant render skipped (assetId=${assetId}, templateId=${templateId}): ${suppressReason}`,
    );
    return null;
  }

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
      // Video face handling deferred — poster-frame detection doesn't
      // track motion across the runtime. Until that lands, video
      // variants pass through unchanged regardless of face_policy.
      // Documented limitation; subscribers in face-sensitive industries
      // should review video before publishing (see Privacy settings).
      ({ outputUrl, renderNotes } = await renderVideoVariant(sourceUrl, templateId, siteId, assetId));
    } else {
      // Still → video-output template uses the Director Call → Producer
      // Call (Kling) path, which needs the analysis + brand tone + prior
      // camera moves. Gather them only when relevant — image-output
      // templates (feed_square etc.) ignore directorContext.
      const directorContext = VIDEO_OUTPUT_TEMPLATES.has(templateId)
        ? await gatherDirectorContext(assetId)
        : null;
      ({ outputUrl, renderNotes } = await renderImageVariant(
        sourceUrl, templateId, siteId, assetId,
        { faces: detectedFaces, adultPolicy: adultFacePolicy, minorPolicy: minorFacePolicy },
        directorContext,
      ));
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
 * Build a slug-derived variant key from the source asset's URL.
 * Falls back to a date-based key when source URL doesn't follow the
 * slug pattern yet (e.g. legacy asset that hasn't been backfilled).
 */
function buildVariantKey(
  siteId: string,
  sourceUrl: string,
  sourceAssetId: string,
  templateId: string,
  ext: string,
): string {
  const slug = extractSlugFromSourceUrl(sourceUrl);
  if (slug) {
    return deriveVariantKey(siteId, slug, sourceAssetId, templateId, ext);
  }
  // Legacy fallback — same date-based pattern as before
  const date = new Date().toISOString().slice(0, 10);
  return `sites/${siteId}/variants/${date}/${templateId}-${Date.now()}.${ext}`;
}

/**
 * Image source → image-or-video target.
 *
 * Video-output templates (reel/story/long) go through the Director Call
 * → Producer Call (Kling) path — full generated motion from the still.
 * Ken Burns is the fallback when either hop fails. Image-output
 * templates (feed_square, feed_portrait, pin_2x3) get a sharp crop.
 */
async function renderImageVariant(
  sourceUrl: string,
  templateId: string,
  siteId: string,
  sourceAssetId: string,
  privacy: {
    faces: DetectedFaceBox[];
    adultPolicy: EffectiveFacePolicy;
    minorPolicy: EffectiveFacePolicy;
  },
  directorContext: DirectorContext | null,
): Promise<{ outputUrl: string; renderNotes: Record<string, unknown> }> {
  // Video-output templates: Director Call → Producer Call (Kling).
  if (VIDEO_OUTPUT_TEMPLATES.has(templateId)) {
    return renderVideoFromStill(
      sourceUrl,
      templateId as DirectorTemplate,
      siteId,
      sourceAssetId,
      directorContext,
    );
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
  const sourceBuffer = Buffer.from(await res.arrayBuffer());

  // Apply face transforms BEFORE crop/resize so privacy treatment
  // operates on the full-resolution source pixels. Each face is routed
  // to either adultPolicy or minorPolicy based on is_potential_minor.
  // No-op when there are no faces, or when every face's routed policy
  // is 'asis' — applyFaceTransforms short-circuits internally.
  const strongFaceCount = privacy.faces.filter((f) => f.confidence >= 0.5).length;
  const minorCount = privacy.faces
    .filter((f) => f.confidence >= 0.5 && f.is_potential_minor === true).length;
  const adultCount = strongFaceCount - minorCount;
  const willTransform =
    strongFaceCount > 0 &&
    !(privacy.adultPolicy === "asis" && privacy.minorPolicy === "asis");

  const inputBuffer: Buffer = willTransform
    ? await applyFaceTransforms(
        sourceBuffer,
        privacy.faces,
        privacy.adultPolicy,
        privacy.minorPolicy,
      )
    : sourceBuffer;

  const outputBuffer = await sharp(inputBuffer)
    .rotate() // Honor EXIF orientation
    .resize(dims.width, dims.height, {
      fit: "cover",
      position: sharp.strategy.attention,
    })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();

  const key = buildVariantKey(siteId, sourceUrl, sourceAssetId, templateId, "jpg");
  const url = await uploadBufferToR2(key, outputBuffer, "image/jpeg");

  return {
    outputUrl: url,
    renderNotes: {
      method: "sharp_attention_crop",
      width: dims.width,
      height: dims.height,
      from: "image",
      ...(willTransform && {
        face_transform: {
          adult_policy: privacy.adultPolicy,
          minor_policy: privacy.minorPolicy,
          adult_faces_treated: adultCount,
          minor_faces_treated: minorCount,
        },
      }),
    },
  };
}

/**
 * Still → video, the director pattern: Director Call (Sonnet 4.6 writes
 * the brief) → Producer Call (Kling renders from the still + brief).
 *
 * Ken Burns is the fallback when EITHER hop returns null — a missing
 * brief or a failed Kling task. Render-pipeline integrity beats creative
 * quality: a briefed asset always gets a video variant, even if it's the
 * older Ken Burns treatment.
 *
 * The brief is recorded in render_settings.director for the audit trail
 * and so sibling renders can read camera_move as a variety constraint.
 */
async function renderVideoFromStill(
  sourceUrl: string,
  templateId: DirectorTemplate,
  siteId: string,
  sourceAssetId: string,
  directorContext: DirectorContext | null,
): Promise<{ outputUrl: string; renderNotes: Record<string, unknown> }> {
  const aspect: "9:16" | "16:9" = templateId === "long_16x9" ? "16:9" : "9:16";
  const spec = DIRECTOR_TEMPLATE_SPECS[templateId];

  // Hop 1 — Director Call. Skipped only if context never got gathered
  // (defensive; renderTemplateVariant always gathers it for video templates).
  if (directorContext) {
    const { direction } = await directShot({
      imageUrl: sourceUrl,
      analysis: directorContext.analysis,
      brandTone: directorContext.brandTone,
      template: templateId,
      previousCameraMoves: directorContext.previousCameraMoves,
    });

    if (direction) {
      // Hop 2 — Producer Call (Kling). Still becomes the first frame.
      const video = await generateVideoFromImage(sourceUrl, direction.renderPrompt, siteId, {
        duration: String(spec.durationSeconds) as "5" | "10",
        aspectRatio: aspect,
      });

      if (video) {
        return {
          outputUrl: video.url,
          renderNotes: {
            method: "director_kling",
            aspect,
            duration_seconds: video.duration,
            from: "image",
            director: {
              prompt: direction.renderPrompt,
              camera_move: direction.cameraMove,
              brands_mentioned: direction.brandsMentioned,
              template_context: templateId,
            },
          },
        };
      }
    }
  }

  // Fallback — Ken Burns. Either the Director Call or the Producer Call
  // returned null. The asset still gets a video variant.
  console.warn(
    `renderVideoFromStill: director/kling path unavailable for ${sourceAssetId}/${templateId} — falling back to Ken Burns`,
  );
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
      method: "ken_burns_fallback",
      aspect,
      duration_seconds: durationPerImage,
      from: "image",
    },
  };
}

/**
 * Video source → video target. Tier-gated render engine selection per
 * project_tracpost_smart_rotate_self_host.md:
 *
 * - Enterprise tier + Smart Rotate service available → subject-aware
 *   reframing via the self-hosted YOLOv8 + FFmpeg service.
 * - Mid-tier OR service unavailable → ffmpeg center-crop via reformatVideo
 *   (Phase 1 quality, fast, deterministic, free per Vercel CPU).
 *
 * Either path writes the result to R2. Layer-1 discipline holds: only
 * smart-rotate-client touches the service URL; everything stored in
 * asset_variants.storage_url is an R2 URL.
 *
 * Smart Rotate service errors fall back to ffmpeg silently — render
 * pipeline integrity > smart-crop quality.
 */
async function renderVideoVariant(
  sourceUrl: string,
  templateId: string,
  siteId: string,
  sourceAssetId: string,
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

  // Tier-check + service-availability check. Both must be true for
  // Smart Rotate; fall through to ffmpeg fallback on either miss or
  // on service error.
  if (isSmartRotateEnabled() && (await isEnterpriseTier(siteId))) {
    const dims = smartRotateDimsForTemplate(templateId);
    if (dims) {
      try {
        const destinationKey = buildVariantKey(siteId, sourceUrl, sourceAssetId, templateId, "mp4");
        const result = await callSmartRotate({
          sourceUrl,
          targetAspect: dims.targetAspect,
          targetWidth: dims.width,
          targetHeight: dims.height,
          destinationKey,
        });
        return {
          outputUrl: result.destinationUrl,
          renderNotes: {
            method: "smart_rotate_yolov8",
            target_aspect: targetAspect,
            from: "video",
            service_duration_seconds: result.durationSeconds,
            ...result.renderSettings,
          },
        };
      } catch (err) {
        console.warn(
          `Smart Rotate failed for asset (assetId siteId=${siteId} template=${templateId}); falling back to ffmpeg center-crop:`,
          err instanceof Error ? err.message : err,
        );
        // Fall through to ffmpeg
      }
    }
  }

  // Fallback: ffmpeg center-crop. Used by mid-tier subscribers and as
  // the safety net when Smart Rotate is unavailable or errored.
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
      // Smart Rotate upgrade available for Enterprise tier per
      // project_tracpost_smart_rotate_self_host.md
      smart_rotate_eligible: false,
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
