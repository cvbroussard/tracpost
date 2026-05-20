import { verifyCookie } from "@/lib/cookie-sign";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { gatherDirectorContext } from "@/lib/video-gen/director-context";
import {
  buildDirectorPrompt,
  directVideoBrief,
  DIRECTOR_TEMPLATE_SPECS,
  type DirectorTemplate,
  type DirectorInput,
} from "@/lib/video-gen/director";
import { generateVideoFromImage } from "@/lib/video-gen/kling";

export const runtime = "nodejs";
// Producer Call (Kling) polls up to 5 min — needs the full budget when
// runProducer is set. The Director-Call-only path returns in ~15-30s.
export const maxDuration = 300;

/**
 * POST /api/manage/director-inspector
 *
 * The director-prompt inspector's backend. A two-hop tool:
 *   - Always: gather Director Call inputs, build + return the assembled
 *     director prompt, and run the Director Call (Hop 1, ~$0.015) to
 *     return the actual brief.
 *   - On runProducer=true: also fire the Producer Call (Hop 2, Kling,
 *     ~$0.20) and return the rendered video URL.
 *
 * Single-template by design — one Director Call + at most one Producer
 * Call fits the 300s budget, unlike renderAllVariantsForAsset's three
 * serial Kling renders.
 *
 * Body: { siteId, assetId?, template?, runProducer?, briefPrompt? }
 *   assetId     — optional; defaults to the most recent triaged image
 *   template    — reel_9x16 | story_9x16 | long_16x9 (default reel_9x16)
 *   briefPrompt — when set, the Director Call is SKIPPED and this exact
 *                 brief is rendered. Lets the operator render precisely
 *                 the brief they reviewed, not a re-rolled one.
 */

const TEMPLATES: DirectorTemplate[] = ["reel_9x16", "story_9x16", "long_16x9"];

export async function POST(req: NextRequest) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (!verifyCookie(adminCookie)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { siteId, assetId: seedAssetId, template, runProducer, briefPrompt } = body || {};
  const renderExactBrief =
    typeof briefPrompt === "string" && briefPrompt.trim().length > 0;

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

  // Assembled prompt — shown verbatim. Pure function, no LLM call.
  const directorPrompt = buildDirectorPrompt(input);

  // Hop 1 — the Director Call. Skipped when the operator passed an exact
  // briefPrompt to render (a Producer-only request). Otherwise always
  // run so the inspector shows the actual brief, not just the prompt
  // that would produce it. Cheap (~$0.015).
  const brief = renderExactBrief ? null : await directVideoBrief(input);

  // Hop 2 — the Producer Call. Expensive; only on explicit request.
  // Renders the supplied briefPrompt verbatim when given, else the brief
  // the Director Call just produced.
  const promptToRender = renderExactBrief
    ? (briefPrompt as string).trim()
    : brief?.prompt || null;

  let render: { url: string; durationSeconds: number } | null = null;
  let producerError: string | null = null;
  if (runProducer) {
    if (!promptToRender) {
      producerError = "No brief to render — the Director Call produced nothing.";
    } else {
      const spec = DIRECTOR_TEMPLATE_SPECS[tpl];
      const aspect = tpl === "long_16x9" ? "16:9" : "9:16";
      const video = await generateVideoFromImage(context.imageUrl, promptToRender, siteId, {
        duration: String(spec.durationSeconds) as "5" | "10",
        aspectRatio: aspect,
      });
      if (video) {
        render = { url: video.url, durationSeconds: video.duration };
      } else {
        producerError = "Producer Call (Kling) failed — see server logs.";
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
    directorPrompt,
    brief,
    briefFailed: !renderExactBrief && brief === null,
    render,
    producerError,
  });
}
