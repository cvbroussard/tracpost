import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";

/**
 * GET /api/accounts/platform-status?site_id=xxx&platform=facebook
 *
 * Returns the connection status for a given site/platform combo. Three states:
 *   - connected           — site has an assigned platform_asset OR an old site_social_links row
 *   - pending_assignment  — subscriber has platform_assets for this platform but
 *                            this site has no assignment yet
 *   - not_connected       — no platform_assets exist for this subscriber on this platform
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const siteId = url.searchParams.get("site_id") || session.activeSiteId;
  const platform = url.searchParams.get("platform");

  if (!siteId) return NextResponse.json({ error: "site_id required" }, { status: 400 });
  if (!platform) return NextResponse.json({ error: "platform required" }, { status: 400 });

  // 1. New model: check site_platform_assets for an assigned asset on this platform
  const [assignedAsset] = await sql`
    SELECT pa.id AS platform_asset_id, pa.asset_id, pa.asset_name, pa.social_account_id,
           sa.token_expires_at, sa.status AS account_status,
           sa.account_name AS connected_user_name
    FROM business_platform_assets spa
    JOIN platform_assets pa ON pa.id = spa.platform_asset_id
    JOIN social_accounts sa ON sa.id = pa.social_account_id
    WHERE spa.business_id = ${siteId}
      AND pa.platform = ${platform}
      AND spa.is_primary = true
      AND sa.billing_account_id = ${session.subscriptionId}
    LIMIT 1
  `;

  if (assignedAsset) {
    // Also fetch the full list of available assets for this platform so the
    // Switch Page picker on the connected card has data to render. This is
    // the same query used in the pending_assignment branch — subscribers in
    // either state see the same selectable list (one is the initial pick,
    // the other is a re-pick).
    //
    // Exclude assets bound to OTHER sites in this subscription — prevents
    // accidental cross-site binding (e.g., picking EK's IG while on B²'s
    // integrations page). To re-bind an asset that's currently with another
    // site, the subscriber must disconnect there first.
    const allAssets = await sql`
      SELECT pa.id, pa.asset_id, pa.asset_name,
             sa.account_name AS connected_user_name,
             sa.token_expires_at
      FROM platform_assets pa
      JOIN social_accounts sa ON sa.id = pa.social_account_id
      WHERE pa.platform = ${platform}
        AND sa.billing_account_id = ${session.subscriptionId}
        AND NOT EXISTS (
          SELECT 1 FROM business_platform_assets spa_other
          WHERE spa_other.platform_asset_id = pa.id
            AND spa_other.business_id != ${siteId}
        )
      ORDER BY pa.asset_name
    `;
    // For now we don't track per-asset published/scheduled counts in the new model
    return NextResponse.json({
      connected: true,
      status: "connected",
      accountId: assignedAsset.platform_asset_id,
      accountName: assignedAsset.asset_name,
      connectedUserName: assignedAsset.connected_user_name,
      socialAccountId: assignedAsset.social_account_id,
      tokenExpiresAt: assignedAsset.token_expires_at ? String(assignedAsset.token_expires_at) : null,
      published: 0,
      scheduled: 0,
      availableAssets: allAssets.length,
      availableAssetList: allAssets.map((a) => ({
        id: a.id,
        assetId: a.asset_id,
        assetName: a.asset_name,
        connectedUserName: a.connected_user_name,
        tokenExpiresAt: a.token_expires_at ? String(a.token_expires_at) : null,
      })),
    });
  }

  // 2. Legacy model: check site_social_links
  const [legacyAccount] = await sql`
    SELECT sa.id, sa.account_name, sa.status, sa.token_expires_at,
           (SELECT COUNT(*)::int FROM social_posts sp WHERE sp.account_id = sa.id AND sp.status = 'published') AS published,
           (SELECT COUNT(*)::int FROM social_posts sp WHERE sp.account_id = sa.id AND sp.status = 'scheduled') AS scheduled
    FROM social_accounts sa
    JOIN business_social_links ssl ON ssl.social_account_id = sa.id
    WHERE ssl.business_id = ${siteId}
      AND sa.platform = ${platform}
      AND sa.billing_account_id = ${session.subscriptionId}
    ORDER BY sa.created_at DESC
    LIMIT 1
  `;

  if (legacyAccount) {
    return NextResponse.json({
      connected: true,
      status: legacyAccount.status,
      accountId: legacyAccount.id,
      accountName: legacyAccount.account_name,
      connectedUserName: null, // legacy model didn't track separate connected user identity
      socialAccountId: legacyAccount.id,
      tokenExpiresAt: legacyAccount.token_expires_at ? String(legacyAccount.token_expires_at) : null,
      published: legacyAccount.published || 0,
      scheduled: legacyAccount.scheduled || 0,
    });
  }

  // 3. Pending assignment: check if subscriber has any platform_assets for this
  // platform that are NOT already bound to another site in this subscription.
  // If every existing asset is already taken by other sites, this site is
  // effectively `not_connected` — there's nothing legitimate to surface.
  const [pendingAsset] = await sql`
    SELECT pa.id, pa.asset_name
    FROM platform_assets pa
    JOIN social_accounts sa ON sa.id = pa.social_account_id
    WHERE pa.platform = ${platform}
      AND sa.billing_account_id = ${session.subscriptionId}
      AND NOT EXISTS (
        SELECT 1 FROM business_platform_assets spa_other
        WHERE spa_other.platform_asset_id = pa.id
          AND spa_other.business_id != ${siteId}
      )
    LIMIT 1
  `;

  if (pendingAsset) {
    const assets = await sql`
      SELECT pa.id, pa.asset_id, pa.asset_name, pa.metadata,
             sa.id AS social_account_id,
             sa.account_name AS connected_user_name,
             sa.token_expires_at
      FROM platform_assets pa
      JOIN social_accounts sa ON sa.id = pa.social_account_id
      WHERE pa.platform = ${platform}
        AND sa.billing_account_id = ${session.subscriptionId}
        AND NOT EXISTS (
          SELECT 1 FROM business_platform_assets spa_other
          WHERE spa_other.platform_asset_id = pa.id
            AND spa_other.business_id != ${siteId}
        )
      ORDER BY pa.asset_name
    `;
    // The OAuth grant we'd revoke if the subscriber disconnects from this
    // pending state — typically all assets share the same social_account
    // (one OAuth grant produced N Pages). Use the first row's social_account_id.
    const socialAccountId = (assets[0]?.social_account_id as string | undefined) ?? null;
    return NextResponse.json({
      connected: false,
      status: "pending_assignment",
      accountId: null,
      accountName: null,
      socialAccountId,
      tokenExpiresAt: null,
      published: 0,
      scheduled: 0,
      availableAssets: assets.length,
      availableAssetList: assets.map((a) => ({
        id: a.id,
        assetId: a.asset_id,
        assetName: a.asset_name,
        connectedUserName: a.connected_user_name,
        tokenExpiresAt: a.token_expires_at ? String(a.token_expires_at) : null,
      })),
    });
  }

  // 4. Not connected at all
  return NextResponse.json({
    connected: false,
    status: "not_connected",
    accountId: null,
    accountName: null,
    tokenExpiresAt: null,
    published: 0,
    scheduled: 0,
  });
}
