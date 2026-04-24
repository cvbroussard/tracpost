import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

/**
 * GET /api/manage/media?site_id=xxx
 * Returns media assets for the manage grid view.
 */
export async function GET(req: NextRequest) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (adminCookie !== "authenticated") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const siteId = new URL(req.url).searchParams.get("site_id");
  if (!siteId) return NextResponse.json({ error: "site_id required" }, { status: 400 });

  const [counts] = await sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE source = 'upload')::int AS uploads,
      COUNT(*) FILTER (WHERE source = 'ai_generated')::int AS ai,
      COUNT(*) FILTER (WHERE triage_status = 'triaged')::int AS triaged,
      COUNT(*) FILTER (WHERE triage_status = 'pending')::int AS pending,
      COUNT(*) FILTER (WHERE context_note IS NOT NULL)::int AS with_context,
      COUNT(*) FILTER (WHERE context_note IS NULL)::int AS without_context,
      ROUND(AVG(quality_score)::numeric, 2) AS avg_quality
    FROM media_assets
    WHERE site_id = ${siteId}
  `;

  const assets = await sql`
    SELECT ma.id, ma.storage_url, ma.media_type, ma.source, ma.triage_status, ma.quality_score,
           ma.context_note,
           COALESCE((ma.metadata->>'context_auto_generated')::boolean, false) AS auto_context,
           (SELECT array_agg(b.name) FROM asset_brands ab JOIN brands b ON b.id = ab.brand_id WHERE ab.asset_id = ma.id) AS brands,
           (SELECT array_agg(p.name) FROM asset_projects ap JOIN projects p ON p.id = ap.project_id WHERE ap.asset_id = ma.id) AS projects
    FROM media_assets ma
    WHERE ma.site_id = ${siteId}
      AND ma.media_type != 'pdf'
    ORDER BY ma.quality_score DESC NULLS LAST
    LIMIT 200
  `;

  return NextResponse.json({
    counts: counts || {},
    assets: assets.map(a => ({
      id: a.id,
      url: a.storage_url,
      type: a.media_type,
      source: a.source,
      status: a.triage_status,
      quality: a.quality_score,
      context: a.context_note,
      autoContext: a.auto_context,
      brands: (a.brands as string[]) || [],
      projects: (a.projects as string[]) || [],
    })),
  });
}
