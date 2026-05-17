import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

/**
 * GET /api/assets/[id]/variants
 *
 * Returns the asset's rendered variants for thumbnail display in the
 * asset modal. Variants are produced asynchronously by the
 * /api/assets/[id]/render-variants endpoint after cascade commit.
 *
 * Response: { variants: [{ id, template_id, storage_url, status,
 *                          media_type, aspect_ratio, created_at }] }
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: assetId } = await params;

  const [asset] = await sql`SELECT id, site_id FROM media_assets WHERE id = ${assetId}`;
  if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  if (!session.sites.some((s) => s.id === asset.site_id)) {
    return NextResponse.json({ error: "Asset not in your subscription" }, { status: 403 });
  }

  const variants = await sql`
    SELECT v.id, v.template_id, v.storage_url, v.status, v.media_type,
           v.aspect_ratio, v.created_at,
           t.label AS template_label, t.platform_id
    FROM asset_variants v
    LEFT JOIN asset_templates t ON t.id = v.template_id
    WHERE v.source_asset_id = ${assetId}
    ORDER BY t.platform_id NULLS LAST, t.label
  `;

  return NextResponse.json({ variants });
}
