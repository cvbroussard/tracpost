import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * GET /api/projects/:id/captions — Caption status for a project.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const { id } = await params;

  const [counts] = await sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE ma.context_note IS NOT NULL AND ma.context_note != '')::int AS captioned,
      COUNT(*) FILTER (WHERE ma.context_note IS NULL OR ma.context_note = '')::int AS uncaptioned
    FROM media_assets ma
    JOIN asset_projects ap ON ap.asset_id = ma.id
    WHERE ap.project_id = ${id}
  `;

  return NextResponse.json({
    total_assets: counts?.total || 0,
    captioned: counts?.captioned || 0,
    uncaptioned: counts?.uncaptioned || 0,
  });
}

/**
 * POST /api/projects/:id/captions — Bulk auto-caption all uncaptioned assets.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;
  const { id } = await params;

  const [project] = await sql`
    SELECT p.id FROM projects p
    JOIN sites s ON p.site_id = s.id
    WHERE p.id = ${id} AND s.subscription_id = ${auth.subscriptionId}
  `;
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const { generateAllCaptions } = await import("@/lib/pipeline/project-captions");
  const generated = await generateAllCaptions(id);

  return NextResponse.json({ generated });
}
