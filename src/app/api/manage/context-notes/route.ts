import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

/**
 * GET /api/manage/context-notes?site_id=xxx
 * Returns media assets with context notes for review/editing.
 */
export async function GET(req: NextRequest) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (adminCookie !== "authenticated") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const siteId = new URL(req.url).searchParams.get("site_id");
  if (!siteId) return NextResponse.json({ error: "site_id required" }, { status: 400 });

  const assets = await sql`
    SELECT id, storage_url, context_note, quality_score,
           COALESCE((metadata->>'context_auto_generated')::boolean, false) AS context_auto_generated,
           COALESCE(
             (SELECT array_agg(b.name) FROM asset_brands ab JOIN brands b ON b.id = ab.brand_id WHERE ab.asset_id = ma.id),
             '{}'
           ) AS detected_vendors
    FROM media_assets ma
    WHERE site_id = ${siteId}
      AND triage_status = 'triaged'
      AND (media_type LIKE 'image%' OR media_type = 'image')
    ORDER BY quality_score DESC NULLS LAST
    LIMIT 100
  `;

  return NextResponse.json({
    assets: assets.map(a => ({
      id: a.id,
      storage_url: a.storage_url,
      context_note: a.context_note,
      quality_score: a.quality_score,
      context_auto_generated: a.context_auto_generated,
      detected_vendors: a.detected_vendors || [],
    })),
  });
}
