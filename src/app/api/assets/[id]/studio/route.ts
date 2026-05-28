import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { uploadBufferToR2 } from "@/lib/r2";
import { seoFilename } from "@/lib/seo-filename";
import {
  editEditorialImage,
  generateEditorialImage,
  editWithReference,
} from "@/lib/image-gen/gemini";

/**
 * POST /api/assets/:id/studio
 *
 * Asset Studio — subscriber-triggered AI tools that operate on or from
 * an existing asset (or, for generate-from-prompt, anchor on this asset
 * for navigation context only).
 *
 * Per the briefing-required principle (project_tracpost_generation_briefing_separation.md):
 *   - All outputs land in `media_assets` rows with `processing_stage='briefed'`
 *   - Modify-only tools (edit/enhance/regenerate) create SIBLINGS — original preserved
 *   - All generated assets carry full provenance metadata (tool, prompt, model, source/parent)
 *   - Subscriber briefs the new asset via the standard PATCH /api/assets/:id flow
 *
 * Body:
 *   {
 *     tool: "edit" | "enhance" | "regenerate" | "animate" | "generate-variation" | "generate-from-prompt" | "draft-caption",
 *     instruction?: string,         // required for edit, generate-variation
 *     prompt?: string,              // required for generate-from-prompt
 *     reference_asset_id?: string,  // optional for generate-from-prompt
 *     duration?: 5 | 10,            // optional for animate (default 5)
 *   }
 *
 * Returns:
 *   { newAssetId: string, processing_stage: "briefed" }
 *   For draft-caption: { caption: string } (no asset created — subscriber edits + saves)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;
  const { id: assetId } = await params;

  // Verify ownership. content_pillar dropped from SELECT (LOCKED 2026-05-09).
  const [asset] = await sql`
    SELECT ma.id, ma.business_id, ma.storage_url, ma.media_type, ma.context_note,
           ma.content_tags
    FROM media_assets ma
    JOIN businesses s ON s.id = ma.business_id
    WHERE ma.id = ${assetId} AND s.billing_account_id = ${auth.subscriptionId}
  `;
  if (!asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const tool = body.tool as string;

  try {
    switch (tool) {
      case "edit": {
        if (!body.instruction || typeof body.instruction !== "string") {
          return NextResponse.json(
            { error: "instruction required for edit" },
            { status: 400 },
          );
        }
        const image = await editEditorialImage(
          asset.storage_url as string,
          body.instruction,
        );
        if (!image) {
          return NextResponse.json({ error: "Edit failed" }, { status: 500 });
        }
        const newId = await persistGeneratedAsset({
          siteId: asset.business_id as string,
          buffer: image.data,
          mimeType: image.mimeType,
          mediaType: "image",
          subscriptionId: auth.subscriptionId,
          provenance: {
            tool: "edit",
            instruction: body.instruction,
            generation_model: "gemini-2.5-flash-image",
            parent_asset_id: assetId,
          },
          inheritFrom: asset,
          isSibling: true,
        });
        return NextResponse.json({ newAssetId: newId, processing_stage: "briefed" });
      }

      case "enhance":
      case "regenerate": {
        // Enhance and regenerate use the post-production pipeline at
        // higher discipline (enhance) or with creative latitude (regenerate).
        const { POST_PRODUCTION_PROMPT } = await import("@/lib/image-gen/enhance");
        const enhancePrompt = tool === "enhance"
          ? POST_PRODUCTION_PROMPT
          : "Dramatically improve this photograph to professional publication quality. Fix all exposure, lighting, color, and clarity issues. Remove any construction debris, tools, or staging items that aren't part of the finished space.";
        const image = await editEditorialImage(asset.storage_url as string, enhancePrompt);
        if (!image) {
          return NextResponse.json({ error: `${tool} failed` }, { status: 500 });
        }
        const newId = await persistGeneratedAsset({
          siteId: asset.business_id as string,
          buffer: image.data,
          mimeType: image.mimeType,
          mediaType: "image",
          subscriptionId: auth.subscriptionId,
          provenance: {
            tool,
            generation_model: "gemini-2.5-flash-image",
            parent_asset_id: assetId,
          },
          inheritFrom: asset,
          isSibling: true,
        });
        return NextResponse.json({ newAssetId: newId, processing_stage: "briefed" });
      }

      case "animate": {
        // Kling motion from this still. Uses the same Kling primitive as
        // the cron-driven Video Pool; result lands in briefed.
        const duration = (body.duration === 10 ? "10" : "5") as "5" | "10";
        const motionPrompt = body.instruction
          || `Add subtle natural motion to this scene. ${(asset.context_note as string) || ""}`.trim();
        const { generateVideoFromImage } = await import("@/lib/video-gen/kling");
        const video = await generateVideoFromImage(
          asset.storage_url as string,
          motionPrompt,
          asset.business_id as string,
          { duration },
        );
        if (!video) {
          return NextResponse.json({ error: "Kling generation failed" }, { status: 500 });
        }
        const [inserted] = await sql`
          INSERT INTO media_assets (
            business_id, storage_url, media_type, context_note,
            source, processing_stage, source_asset_id,
            content_tags, metadata
          ) VALUES (
            ${asset.business_id}, ${video.url}, 'video',
            NULL,
            'ai_generated', 'briefed', ${assetId},
            ${asset.content_tags || []},
            ${JSON.stringify({
              ai_generated: true,
              tool: "animate",
              duration,
              generation_prompt: motionPrompt,
              generation_model: "kling-v2-6",
              parent_asset_id: assetId,
              triggered_by_subscription_id: auth.subscriptionId,
              triggered_at: new Date().toISOString(),
            })}::jsonb
          )
          RETURNING id
        `;
        return NextResponse.json({ newAssetId: inserted.id, processing_stage: "briefed" });
      }

      case "generate-variation": {
        if (!body.instruction || typeof body.instruction !== "string") {
          return NextResponse.json(
            { error: "instruction required for generate-variation" },
            { status: 400 },
          );
        }
        const image = await editWithReference(
          asset.storage_url as string,
          asset.storage_url as string, // same image as both source and reference
          body.instruction,
        );
        if (!image) {
          return NextResponse.json({ error: "Variation failed" }, { status: 500 });
        }
        const newId = await persistGeneratedAsset({
          siteId: asset.business_id as string,
          buffer: image.data,
          mimeType: image.mimeType,
          mediaType: "image",
          subscriptionId: auth.subscriptionId,
          provenance: {
            tool: "generate-variation",
            instruction: body.instruction,
            generation_model: "gemini-2.5-flash-image",
            source_asset_id: assetId,
          },
          inheritFrom: asset,
          isSibling: false,
        });
        return NextResponse.json({ newAssetId: newId, processing_stage: "briefed" });
      }

      case "generate-from-prompt": {
        if (!body.prompt || typeof body.prompt !== "string") {
          return NextResponse.json(
            { error: "prompt required for generate-from-prompt" },
            { status: 400 },
          );
        }
        const image = await generateEditorialImage(body.prompt);
        if (!image) {
          return NextResponse.json({ error: "Generation failed" }, { status: 500 });
        }
        const newId = await persistGeneratedAsset({
          siteId: asset.business_id as string,
          buffer: image.data,
          mimeType: image.mimeType,
          mediaType: "image",
          subscriptionId: auth.subscriptionId,
          provenance: {
            tool: "generate-from-prompt",
            generation_prompt: body.prompt,
            generation_model: "gemini-2.5-flash-image",
            anchor_asset_id: assetId, // anchor only, not a true source
          },
          inheritFrom: null, // no inheritance — this is fresh content
          isSibling: false,
        });
        return NextResponse.json({ newAssetId: newId, processing_stage: "briefed" });
      }

      case "draft-caption": {
        // Suggest a caption for the OPEN asset. Does NOT create a new
        // asset and does NOT auto-save — returns text for subscriber to
        // edit before saving via PATCH /api/assets/:id.
        // Uses the existing generate-caption endpoint logic if available;
        // otherwise punts (operator can use existing UI).
        return NextResponse.json(
          { error: "draft-caption not yet wired in studio endpoint — use existing /api/assets/:id/generate-caption" },
          { status: 501 },
        );
      }

      default:
        return NextResponse.json(
          { error: `Unknown tool: ${tool}` },
          { status: 400 },
        );
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Studio operation failed" },
      { status: 500 },
    );
  }
}

/**
 * Common path for persisting a Gemini-generated image as a new
 * briefed asset with proper provenance + inheritance.
 */
async function persistGeneratedAsset(opts: {
  siteId: string;
  buffer: Buffer;
  mimeType: string;
  mediaType: "image" | "video";
  subscriptionId: string;
  provenance: Record<string, unknown>;
  inheritFrom: Record<string, unknown> | null;
  isSibling: boolean;
}): Promise<string> {
  // Upload to R2
  const ext = opts.mimeType.includes("png") ? "png" : "jpg";
  const tool = (opts.provenance.tool as string) || "studio";
  const fname = seoFilename(`studio-${tool}`, ext);
  const key = `sites/${opts.siteId}/media/${fname}`;
  const url = await uploadBufferToR2(key, opts.buffer, opts.mimeType);

  // Build metadata
  const metadata = {
    ai_generated: true,
    ...opts.provenance,
    triggered_by_subscription_id: opts.subscriptionId,
    triggered_at: new Date().toISOString(),
    is_sibling: opts.isSibling,
  };

  // Inherit content_tags / asset_projects from source for siblings.
  // (content_pillar inheritance dropped — pillars not stored on assets,
  // LOCKED 2026-05-09. Pillar membership re-derives from inherited tags.)
  const contentTags = opts.isSibling && opts.inheritFrom
    ? (opts.inheritFrom.content_tags as string[]) || []
    : [];

  const sourceAssetId = (opts.provenance.source_asset_id as string)
    || (opts.provenance.parent_asset_id as string)
    || null;

  const [inserted] = await sql`
    INSERT INTO media_assets (
      business_id, storage_url, media_type, context_note,
      source, processing_stage, source_asset_id,
      content_tags, metadata
    ) VALUES (
      ${opts.siteId}, ${url}, ${opts.mediaType}, NULL,
      'ai_generated', 'briefed', ${sourceAssetId},
      ${contentTags},
      ${JSON.stringify(metadata)}::jsonb
    )
    RETURNING id
  `;

  // Inherit asset_projects from source for siblings (candidate context)
  if (opts.isSibling && sourceAssetId) {
    await sql`
      INSERT INTO asset_projects (asset_id, project_id)
      SELECT ${inserted.id}, project_id
      FROM asset_projects
      WHERE asset_id = ${sourceAssetId}
      ON CONFLICT DO NOTHING
    `;
  }

  return inserted.id as string;
}
