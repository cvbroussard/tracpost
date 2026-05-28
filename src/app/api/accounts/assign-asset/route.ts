import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { assignSiteToAsset } from "@/lib/platform-assets";

/**
 * POST /api/accounts/assign-asset
 *
 * Body: { site_id, platform_asset_id }
 *
 * Subscriber-facing endpoint to bind a platform asset (e.g., a Facebook
 * Page) to one of their sites. Replaces the operator-managed manual
 * linking step that was previously required when the OAuth callback
 * couldn't auto-assign (multi-asset case).
 *
 * Per the OAuth single-asset selection policy:
 *   - One Page per site (one IG account per site, one Ad Account per site)
 *   - If subscriber wants to switch the connected Page later, they call
 *     this same endpoint with a different platform_asset_id; the previous
 *     binding is replaced (is_primary moves to the new asset)
 *
 * Validates that:
 *   - The session has access to the site (subscriber owns it)
 *   - The platform_asset belongs to the same subscription
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const siteId = body.site_id;
  const platformAssetId = body.platform_asset_id;

  if (!siteId || !platformAssetId) {
    return NextResponse.json(
      { error: "site_id and platform_asset_id required" },
      { status: 400 },
    );
  }

  // Verify the subscriber owns this site.
  const [siteRow] = await sql`
    SELECT id FROM businesses
    WHERE id = ${siteId} AND billing_account_id = ${session.subscriptionId}
    LIMIT 1
  `;
  if (!siteRow) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  // Verify the platform_asset is reachable by the subscription's social_accounts.
  const [assetRow] = await sql`
    SELECT pa.id, pa.platform
    FROM platform_assets pa
    JOIN social_accounts sa ON sa.id = pa.social_account_id
    WHERE pa.id = ${platformAssetId}
      AND sa.billing_account_id = ${session.subscriptionId}
    LIMIT 1
  `;
  if (!assetRow) {
    return NextResponse.json(
      { error: "Asset not accessible by this subscription" },
      { status: 404 },
    );
  }

  // Strict 1:1: clear any existing primary assignment for this site+platform
  // before binding the new asset. One business = one Page.
  await sql`
    UPDATE business_platform_assets
    SET is_primary = false
    WHERE business_id = ${siteId}
      AND platform_asset_id IN (
        SELECT id FROM platform_assets WHERE platform = ${assetRow.platform}
      )
  `;

  await assignSiteToAsset({
    siteId,
    platformAssetId,
    isPrimary: true,
  });

  return NextResponse.json({ success: true });
}
