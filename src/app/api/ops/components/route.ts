import { isAdminRequest } from "@/lib/admin-session";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/ops/components?siteId=...
 *
 * Flat top-level list of media_components for the site, each row joined
 * with its production_events (the Director + Producer calls that
 * produced it) and the source asset's storage_url (for side-by-side
 * source/render review). Per the design law: components are first-class
 * operator objects; source_asset_id is provenance, not a parent
 * hierarchy.
 */
export async function GET(req: NextRequest) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const siteId = new URL(req.url).searchParams.get("siteId");
  if (!siteId) {
    return NextResponse.json({ error: "siteId required" }, { status: 400 });
  }

  const components = await sql`
    SELECT
      c.id,
      c.kind,
      c.storage_url,
      c.source_asset_id,
      c.status,
      c.created_at,
      c.render_settings,
      a.storage_url AS source_asset_url,
      a.media_type  AS source_asset_media_type,
      COALESCE(
        json_agg(
          json_build_object(
            'process',    e.process,
            'model',      e.model,
            'prompt',     e.prompt,
            'settings',   e.settings,
            'created_at', e.created_at
          ) ORDER BY e.created_at
        ) FILTER (WHERE e.id IS NOT NULL),
        '[]'::json
      ) AS events
    FROM media_components c
    LEFT JOIN production_events e ON e.output_component_id = c.id
    LEFT JOIN media_assets a       ON a.id = c.source_asset_id
    WHERE c.business_id = ${siteId}
    GROUP BY c.id, a.storage_url, a.media_type
    ORDER BY c.created_at DESC
    LIMIT 100
  `;

  return NextResponse.json({ components });
}
