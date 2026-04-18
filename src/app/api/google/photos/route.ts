import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";

/**
 * GET /api/google/photos?site_id=xxx
 * Returns synced GBP photos + eligible media assets for the subscriber.
 */
export async function GET(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  const siteId = new URL(req.url).searchParams.get("site_id");
  if (!siteId) {
    return NextResponse.json({ error: "site_id required" }, { status: 400 });
  }

  // Synced photos (already on GBP)
  const synced = await sql`
    SELECT gps.*, ma.quality_score, ma.content_pillar, ma.ai_analysis
    FROM gbp_photo_sync gps
    LEFT JOIN media_assets ma ON ma.id = gps.media_asset_id
    WHERE gps.site_id = ${siteId}
    ORDER BY gps.synced_at DESC
  `;

  // Eligible but not yet synced
  const eligible = await sql`
    SELECT ma.id, ma.storage_url, ma.quality_score, ma.content_pillar,
           ma.ai_analysis, ma.created_at
    FROM media_assets ma
    WHERE ma.site_id = ${siteId}
      AND ma.triage_status = 'triaged'
      AND ma.quality_score >= 0.5
      AND ma.platform_fit @> ARRAY['gbp']::text[]
      AND ma.media_type LIKE 'image/%'
      AND NOT EXISTS (
        SELECT 1 FROM gbp_photo_sync gps
        WHERE gps.media_asset_id = ma.id AND gps.site_id = ${siteId}
      )
    ORDER BY ma.quality_score DESC
    LIMIT 50
  `;

  // Stats
  const [stats] = await sql`
    SELECT
      COUNT(*)::int AS total_synced,
      COUNT(*) FILTER (WHERE category = 'PRODUCT')::int AS product,
      COUNT(*) FILTER (WHERE category = 'AT_WORK')::int AS at_work,
      COUNT(*) FILTER (WHERE category = 'EXTERIOR')::int AS exterior,
      COUNT(*) FILTER (WHERE category = 'INTERIOR')::int AS interior
    FROM gbp_photo_sync
    WHERE site_id = ${siteId}
  `;

  return NextResponse.json({ synced, eligible, stats });
}
