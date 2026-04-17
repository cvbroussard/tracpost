import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { renderAsset } from "@/lib/render/engine";
import { loadContentSignals, loadTenantSignals, generateRenderPlans } from "@/lib/render/playbook";
import { createBeforeAfterComposite, detectBeforeAfterPair } from "@/lib/render/composite";
import { uploadBufferToR2 } from "@/lib/r2";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/assets/:id/render
 *
 * Manual render triggers from the media library edit modal.
 *
 * Body:
 *   { type: "all_platforms" }   → render for all connected platforms
 *   { type: "before_after" }    → auto-detect + compose B/A from project
 *   { type: "single", platform: "instagram" } → render for one platform
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;
  const { id: assetId } = await params;

  const [asset] = await sql`
    SELECT ma.id, ma.site_id
    FROM media_assets ma
    JOIN sites s ON ma.site_id = s.id
    WHERE ma.id = ${assetId} AND s.subscription_id = ${auth.subscriptionId}
  `;
  if (!asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const type = body.type || "all_platforms";
  const siteId = asset.site_id as string;

  try {
    if (type === "before_after") {
      // Find the project this asset belongs to
      const [link] = await sql`
        SELECT project_id FROM asset_projects WHERE asset_id = ${assetId} LIMIT 1
      `;
      if (!link?.project_id) {
        return NextResponse.json({ error: "Asset not linked to a project" }, { status: 400 });
      }

      const pair = await detectBeforeAfterPair(String(link.project_id));
      if (!pair) {
        return NextResponse.json({ error: "Could not find before/after pair" }, { status: 400 });
      }

      const composite = await createBeforeAfterComposite({
        beforeUrl: pair.beforeUrl,
        afterUrl: pair.afterUrl,
      });

      const date = new Date().toISOString().slice(0, 10);
      const key = `sites/${siteId}/composites/${date}/before-after-${Date.now()}.jpg`;
      const url = await uploadBufferToR2(key, composite, "image/jpeg");

      return NextResponse.json({ success: true, type: "before_after", url });
    }

    // Reset render status for re-render
    await sql`
      UPDATE media_assets SET render_status = 'pending' WHERE id = ${assetId}
    `;

    if (type === "single" && body.platform) {
      const [contentSignals, tenantSignals] = await Promise.all([
        loadContentSignals(assetId),
        loadTenantSignals(siteId),
      ]);
      const allPlans = await generateRenderPlans(contentSignals, tenantSignals);
      const plan = allPlans.find((p) => p.platform === body.platform);
      if (!plan) {
        return NextResponse.json({ error: `No plan for platform: ${body.platform}` }, { status: 400 });
      }
      const variants = await renderAsset(assetId, [plan]);
      return NextResponse.json({ success: true, type: "single", platform: body.platform, variants });
    }

    // all_platforms — render for all connected platforms
    const [contentSignals, tenantSignals] = await Promise.all([
      loadContentSignals(assetId),
      loadTenantSignals(siteId),
    ]);
    const plans = await generateRenderPlans(contentSignals, tenantSignals);
    const variants = await renderAsset(assetId, plans);

    return NextResponse.json({
      success: true,
      type: "all_platforms",
      variant_count: Object.keys(variants).length,
      platforms: Object.keys(variants),
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
