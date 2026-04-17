import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { renderAssetVariants, renderPendingAssets } from "@/lib/pipeline/render-step";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/admin/sites/[siteId]/render
 *
 * Actions:
 *   { action: "render_asset", assetId: "..." }  → render one asset
 *   { action: "render_pending" }                 → batch render pending assets
 *   { action: "re_render_asset", assetId: "..." } → force re-render
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (adminCookie !== "authenticated") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { siteId } = await params;
  const body = await req.json().catch(() => ({}));
  const action = body.action || "render_pending";

  const [site] = await sql`SELECT id FROM sites WHERE id = ${siteId}`;
  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  if (action === "render_asset" || action === "re_render_asset") {
    const assetId = body.assetId;
    if (!assetId) {
      return NextResponse.json({ error: "assetId required" }, { status: 400 });
    }

    // Force re-render: reset status first
    if (action === "re_render_asset") {
      await sql`
        UPDATE media_assets
        SET render_status = 'pending', variants = '{}'::jsonb
        WHERE id = ${assetId} AND site_id = ${siteId}
      `;
    }

    const result = await renderAssetVariants(assetId);
    return NextResponse.json({ success: true, ...result });
  }

  if (action === "render_pending") {
    const result = await renderPendingAssets(siteId);
    return NextResponse.json({ success: true, ...result });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
