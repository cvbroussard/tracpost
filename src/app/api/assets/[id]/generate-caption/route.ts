import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/assets/:id/generate-caption
 *
 * Generates 5 text outputs in ONE vision API call:
 * context_note, pin_headline, display_caption, alt_text, social_hook.
 *
 * Saves all outputs to media_assets.metadata.generated_text.
 * Returns the context_note for the edit modal + a flag indicating
 * generation already happened (to discourage re-generation).
 *
 * Body (optional):
 *   { force: true }  → regenerate even if already generated
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;
  const { id } = await params;

  const [asset] = await sql`
    SELECT ma.id, ma.site_id, ma.storage_url, ma.media_type,
           ma.date_taken, ma.created_at, ma.metadata, ma.context_note,
           ma.ai_analysis
    FROM media_assets ma
    JOIN sites s ON ma.site_id = s.id
    WHERE ma.id = ${id} AND s.subscription_id = ${auth.subscriptionId}
  `;

  if (!asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  const meta = (asset.metadata || {}) as Record<string, unknown>;
  const body = await req.json().catch(() => ({}));
  const force = body.force === true;

  // Check if already generated (skip unless forced)
  const existingGenerated = meta.generated_text as Record<string, unknown> | undefined;
  if (existingGenerated?.generated_at && !force) {
    return NextResponse.json({
      caption: existingGenerated.context_note,
      already_generated: true,
      generated_text: existingGenerated,
    });
  }

  const { generateAssetText, buildProjectSnapshot, buildSiteSnapshot } = await import("@/lib/pipeline/project-captions");

  // Try project context first, fall back to site context
  const [projectLink] = await sql`
    SELECT p.id FROM projects p
    JOIN asset_projects ap ON ap.project_id = p.id
    WHERE ap.asset_id = ${id}
    LIMIT 1
  `;

  const snapshot = projectLink
    ? await buildProjectSnapshot(projectLink.id as string)
    : await buildSiteSnapshot(asset.site_id as string);

  const result = await generateAssetText(asset, snapshot);

  if (!result) {
    return NextResponse.json({ error: "Text generation failed" }, { status: 500 });
  }

  // Save all generated text to metadata.generated_text
  await sql`
    UPDATE media_assets
    SET metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ generated_text: result })}::jsonb
    WHERE id = ${id}
  `;

  // Seed context_note ONLY if it's currently empty (don't overwrite tenant's edits)
  if (!asset.context_note) {
    await sql`
      UPDATE media_assets SET context_note = ${result.context_note} WHERE id = ${id}
    `;
  }

  return NextResponse.json({
    caption: result.context_note,
    generated_text: result,
    already_generated: false,
  });
}
