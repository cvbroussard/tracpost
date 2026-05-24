import { randomUUID } from "node:crypto";
import { verifyCookie } from "@/lib/cookie-sign";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { gatherDirectorContext } from "@/lib/video-gen/director-context";
import {
  buildDirectorInstructions,
  directShot,
  DIRECTOR_MODEL,
  DIRECTOR_TEMPLATE_SPECS,
  type DirectorTemplate,
  type DirectorInput,
} from "@/lib/video-gen/director";
import { generateVideoFromImage } from "@/lib/video-gen/kling";
import { generateVideoFromImageVeo } from "@/lib/video-gen/gemini-veo";
import { generateVideoFromImageRunway } from "@/lib/video-gen/runway";

export const runtime = "nodejs";
// The Producer Call (Kling or Veo) polls for minutes — needs the full
// budget when runProducer is set. The Director-Call-only path returns in
// ~15-30s.
export const maxDuration = 300;

/**
 * POST /api/manage/motion-gen
 *
 * The Motion Gen inspector's backend. A two-hop tool:
 *   - Always: gather Director Call inputs, build + return the assembled
 *     director instructions, and run the Director Call (Hop 1, ~$0.015)
 *     to return the actual shot direction.
 *   - On runProducer=true: also fire the Producer Call (Hop 2) on the
 *     selected producer model, persist the render as a media_components
 *     row + Director/Producer production_events, and return the URL.
 *
 * Single-template by design — one Director Call + at most one Producer
 * Call fits the 300s budget, unlike renderAllVariantsForAsset's three
 * serial Kling renders.
 *
 * Body: { siteId, assetId?, template?, runProducer?, renderPrompt?, shotDirection?, producerModel? }
 *   assetId       — optional; defaults to the most recent analyzed image
 *   template      — reel_9x16 | story_9x16 | long_16x9 (default reel_9x16)
 *   renderPrompt  — when set, the Director Call is SKIPPED and this exact
 *                   shot direction is rendered. Lets the operator render
 *                   precisely the direction they reviewed, not a re-rolled one.
 *   shotDirection — the {renderPrompt,cameraMove,brandsMentioned} the Director
 *                   produced; carried back on a render so the persisted
 *                   provenance is complete.
 *   producerModel — kling (default) | runway | gemini. Picks the Hop-2
 *                   render engine; the shot direction is engine-agnostic.
 */

const TEMPLATES: DirectorTemplate[] = ["reel_9x16", "story_9x16", "long_16x9"];

export async function POST(req: NextRequest) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (!verifyCookie(adminCookie)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const {
    siteId,
    assetId: seedAssetId,
    template,
    runProducer,
    renderPrompt,
    producerModel,
    shotDirection: passedShotDirection,
  } = body || {};
  const renderExactDirection =
    typeof renderPrompt === "string" && renderPrompt.trim().length > 0;
  const producer: "kling" | "gemini" | "runway" =
    producerModel === "gemini"
      ? "gemini"
      : producerModel === "runway"
        ? "runway"
        : "kling";

  if (!siteId || typeof siteId !== "string") {
    return NextResponse.json({ error: "siteId required" }, { status: 400 });
  }
  const tpl: DirectorTemplate = TEMPLATES.includes(template) ? template : "reel_9x16";

  // Resolve the asset — seeded UUID, or the most recent analyzed image.
  // The Director Call needs analysis JSON as an input stream, so only
  // 'analyzed' assets are eligible (cascade-committed). Briefed-but-not-
  // analyzed assets would direct off incomplete input.
  let assetId: string | null = seedAssetId || null;
  if (!assetId) {
    const [row] = await sql`
      SELECT id FROM media_assets
      WHERE site_id = ${siteId}
        AND media_type ILIKE 'image%'
        AND processing_stage = 'analyzed'
        AND archived_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `;
    assetId = (row?.id as string) || null;
  }
  if (!assetId) {
    return NextResponse.json(
      { error: "No eligible analyzed image asset found for this site" },
      { status: 404 },
    );
  }

  // Gather Director Call inputs — the exact path the render pipeline uses.
  const context = await gatherDirectorContext(assetId);
  if (!context) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }
  if (!context.imageUrl) {
    return NextResponse.json(
      { error: "Asset has no storage_url — cannot run the Director Call" },
      { status: 422 },
    );
  }

  const input: DirectorInput = {
    imageUrl: context.imageUrl,
    analysis: context.analysis,
    brandTone: context.brandTone,
    template: tpl,
    previousCameraMoves: context.previousCameraMoves,
  };

  // Assembled director instructions — shown verbatim. Pure, no LLM call.
  const directorInstructions = buildDirectorInstructions(input);

  // Hop 1 — the Director Call. Skipped when the operator passed an exact
  // renderPrompt to render (a Producer-only request). Otherwise always
  // run so the inspector shows the actual shot direction, not just the
  // instructions that would produce it. Cheap (~$0.015).
  const directorResult = renderExactDirection ? null : await directShot(input);
  const direction = directorResult?.direction ?? null;

  // Hop 2 — the Producer Call. Expensive; only on explicit request.
  // Renders the supplied renderPrompt verbatim when given, else the shot
  // direction the Director Call just produced.
  const promptToRender = renderExactDirection
    ? (renderPrompt as string).trim()
    : direction?.renderPrompt || null;

  let render: { url: string; durationSeconds: number } | null = null;
  let producerError: string | null = null;
  if (runProducer) {
    if (!promptToRender) {
      producerError = "No shot direction to render — the Director Call produced nothing.";
    } else {
      const spec = DIRECTOR_TEMPLATE_SPECS[tpl];
      // Aspect no longer flows through the producer call. Each producer
      // renders at the source's aspect (Kling natively; Runway picks the
      // closest supported ratio from probed source dims; Veo is pulled).
      // Smart Rotate handles target-aspect framing downstream — Option 3.
      const video =
        producer === "gemini"
          ? await generateVideoFromImageVeo(context.imageUrl, promptToRender, siteId)
          : producer === "runway"
            ? await generateVideoFromImageRunway(context.imageUrl, promptToRender, siteId, {
                duration: spec.durationSeconds,
              })
            : await generateVideoFromImage(context.imageUrl, promptToRender, siteId, {
                duration: String(spec.durationSeconds) as "5" | "10",
              });
      if (video) {
        render = { url: video.url, durationSeconds: video.duration };

        // Persist the render as a production-layer artifact (migration
        // 136): one media_components row (the visual render) + two
        // production_events rows (the Director + Producer calls), all in
        // one transaction so a component never lands without its
        // provenance. Both events point output_component_id at the
        // render, so the Components viewer gets the video + both calls
        // from a single walk. Non-fatal — the render already succeeded;
        // a logging failure must not 500 it.
        try {
          const shotDir =
            passedShotDirection && typeof passedShotDirection === "object"
              ? passedShotDirection
              : { renderPrompt: promptToRender };
          const componentId = randomUUID();
          const inputs = JSON.stringify([{ type: "media_asset", id: assetId }]);
          await sql.transaction([
            sql`
              INSERT INTO media_components
                (id, site_id, kind, storage_url, source_asset_id, status, render_settings)
              VALUES (
                ${componentId}, ${siteId}, 'visual_render', ${video.url},
                ${assetId}, 'ready',
                ${JSON.stringify({
                  template: tpl,
                  producer_model: producer,
                  duration_seconds: video.duration,
                  shot_direction: shotDir,
                })}::jsonb
              )
            `,
            sql`
              INSERT INTO production_events
                (site_id, process, model, prompt, settings, inputs, output_component_id)
              VALUES (
                ${siteId}, 'director_call', ${DIRECTOR_MODEL},
                ${directorInstructions},
                ${JSON.stringify({
                  template: tpl,
                  brand_tone: context.brandTone,
                  shot_direction: shotDir,
                })}::jsonb,
                ${inputs}::jsonb, ${componentId}
              )
            `,
            sql`
              INSERT INTO production_events
                (site_id, process, model, prompt, settings, inputs, output_component_id)
              VALUES (
                ${siteId}, 'producer_call', ${producer},
                ${promptToRender},
                ${JSON.stringify({
                  template: tpl,
                  duration_seconds: video.duration,
                })}::jsonb,
                ${inputs}::jsonb, ${componentId}
              )
            `,
          ]);
        } catch (err) {
          console.warn(
            "motion-gen: production-layer write failed:",
            err instanceof Error ? err.message : err,
          );
        }
      } else {
        const producerLabel =
          producer === "gemini" ? "Gemini / Veo" : producer === "runway" ? "Runway" : "Kling";
        producerError = `Producer Call (${producerLabel}) failed — see server logs.`;
      }
    }
  }

  return NextResponse.json({
    assetId,
    imageUrl: context.imageUrl,
    template: tpl,
    templateSpec: DIRECTOR_TEMPLATE_SPECS[tpl],
    context: {
      analysis: context.analysis,
      brandTone: context.brandTone,
      previousCameraMoves: context.previousCameraMoves,
    },
    directorInstructions,
    direction,
    directionFailed: !renderExactDirection && direction === null,
    directionError: directorResult?.error ?? null,
    producerModel: producer,
    render,
    producerError,
  });
}

/**
 * GET /api/manage/motion-gen?siteId=...
 *
 * Lists recent analyzed image assets for the source-asset picker. Same
 * eligibility filter the POST handler's auto-resolve uses (analyzed,
 * image, not archived, has a storage_url) and the same created_at DESC
 * order — so the picker's first row is exactly what "Most recent
 * analyzed image" resolves to.
 */
export async function GET(req: NextRequest) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (!verifyCookie(adminCookie)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const siteId = new URL(req.url).searchParams.get("siteId");
  if (!siteId) {
    return NextResponse.json({ error: "siteId required" }, { status: 400 });
  }

  const rows = await sql`
    SELECT id, storage_url, created_at
    FROM media_assets
    WHERE site_id = ${siteId}
      AND media_type ILIKE 'image%'
      AND processing_stage = 'analyzed'
      AND archived_at IS NULL
      AND storage_url IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 12
  `;

  const assets = rows.map((r) => {
    const url = (r.storage_url as string) || "";
    const basename = decodeURIComponent(url.split("/").pop() || "").split("?")[0];
    const taken = r.created_at ? new Date(r.created_at as string) : null;
    const date = taken ? `${taken.getMonth() + 1}/${taken.getDate()}` : "";
    const id = r.id as string;
    return {
      id,
      label: [basename || id.slice(0, 8), date].filter(Boolean).join("  ·  "),
    };
  });

  return NextResponse.json({ assets });
}
