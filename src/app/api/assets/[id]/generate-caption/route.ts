import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/assets/:id/generate-caption
 *
 * Generate an AI caption for this asset using its project's context snapshot.
 * Returns the caption as a draft — does NOT write to DB.
 * The user decides whether to keep, edit, or discard.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;
  const { id } = await params;

  // Get asset + verify ownership
  const [asset] = await sql`
    SELECT ma.id, ma.site_id, ma.storage_url, ma.media_type, ma.date_taken, ma.created_at, ma.metadata
    FROM media_assets ma
    JOIN sites s ON ma.site_id = s.id
    WHERE ma.id = ${id} AND s.subscription_id = ${auth.subscriptionId}
  `;

  if (!asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  // Find the project this asset belongs to
  const [projectLink] = await sql`
    SELECT p.id, p.caption_mode, p.context_snapshot
    FROM projects p
    JOIN asset_projects ap ON ap.project_id = p.id
    WHERE ap.asset_id = ${id}
    LIMIT 1
  `;

  if (!projectLink) {
    return NextResponse.json({ error: "Asset is not assigned to a project" }, { status: 400 });
  }

  const mode = projectLink.caption_mode as string;
  if (mode === "seeding") {
    return NextResponse.json({
      error: "Caption generation requires at least 3 manual captions in this project",
    }, { status: 400 });
  }

  // Generate caption using project snapshot
  const { generateCaptionForAsset, buildProjectSnapshot } = await import("@/lib/pipeline/project-captions");

  // Rebuild snapshot to include latest captions
  const snapshot = await buildProjectSnapshot(projectLink.id as string);

  const caption = await generateCaptionForAsset(asset, snapshot);

  if (!caption) {
    return NextResponse.json({ error: "Caption generation failed" }, { status: 500 });
  }

  return NextResponse.json({ caption });
}
