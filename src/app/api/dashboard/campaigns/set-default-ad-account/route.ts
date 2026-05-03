import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";

/**
 * POST /api/dashboard/campaigns/set-default-ad-account
 *
 * Body: { platformAssetId }
 *
 * Sets the chosen ad account as the primary (default) for the active
 * Business. Auto-assigns it if it wasn't already, demotes any other
 * primary, and ensures exactly one primary remains.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!session.activeSiteId) return NextResponse.json({ error: "No active site" }, { status: 400 });
  if (!session.plan.toLowerCase().includes("enterprise")) {
    return NextResponse.json({ error: "Enterprise tier required" }, { status: 403 });
  }

  const body = await req.json();
  const platformAssetId = String(body.platformAssetId || "").trim();
  if (!platformAssetId) {
    return NextResponse.json({ error: "platformAssetId required" }, { status: 400 });
  }

  // Verify the asset belongs to this subscription's grants
  const [verify] = await sql`
    SELECT pa.id
    FROM platform_assets pa
    JOIN social_accounts sa ON sa.id = pa.social_account_id
    WHERE pa.id = ${platformAssetId}
      AND pa.asset_type = 'meta_ad_account'
      AND sa.subscription_id = ${session.subscriptionId}
  `;
  if (!verify) {
    return NextResponse.json({ error: "ad account not found in your grants" }, { status: 404 });
  }

  // Demote any current primaries for this site (across all ad accounts)
  await sql`
    UPDATE site_platform_assets spa
    SET is_primary = false
    FROM platform_assets pa
    WHERE spa.platform_asset_id = pa.id
      AND spa.site_id = ${session.activeSiteId}
      AND pa.asset_type = 'meta_ad_account'
      AND spa.is_primary = true
  `;

  // Upsert: assign the chosen account to this site as primary
  await sql`
    INSERT INTO site_platform_assets (site_id, platform_asset_id, is_primary)
    VALUES (${session.activeSiteId}, ${platformAssetId}, true)
    ON CONFLICT (site_id, platform_asset_id)
    DO UPDATE SET is_primary = true
  `;

  return NextResponse.json({ success: true, platformAssetId, isPrimary: true });
}
