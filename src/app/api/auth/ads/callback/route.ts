import { oauthSuccessUrl, oauthErrorUrl } from "@/lib/oauth-redirect";
import { NextRequest, NextResponse } from "next/server";
import {
  exchangeAdsCodeForToken,
  discoverAdAccounts,
  ADS_SCOPES,
} from "@/lib/meta-ads";
import { getMetaUserInfo } from "@/lib/meta";
import { sql } from "@/lib/db";
import {
  recordOAuthGrant,
  recordAsset,
  assignSiteToAsset,
} from "@/lib/platform-assets";

/**
 * GET /api/auth/ads/callback?code=xxx&state=xxx
 *
 * Meta redirects here after the user authorizes the TracPost — Ads app.
 *   1. Exchange code for long-lived token
 *   2. Identify the Meta user (one social_accounts row per Meta user
 *      per subscriber, platform='meta_ads' to keep separate from the
 *      organic 'meta' grant)
 *   3. Discover ad accounts the token can access
 *   4. Store each as a platform_asset (asset_type='meta_ad_account')
 *   5. Auto-assign on single-site/single-account match (same policy as
 *      the organic Meta callback)
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const stateParam = searchParams.get("state");
  const error = searchParams.get("error");

  let source: string | undefined;
  if (stateParam) {
    try {
      const parsed = JSON.parse(Buffer.from(stateParam, "base64url").toString());
      source = parsed.source;
    } catch { /* ignore */ }
  }

  if (error) {
    return NextResponse.redirect(oauthErrorUrl(source, "oauth_denied"));
  }
  if (!code || !stateParam) {
    return NextResponse.redirect(oauthErrorUrl(source, "missing_params"));
  }

  let state: { subscription_id: string; site_id?: string | null; source?: string };
  try {
    state = JSON.parse(Buffer.from(stateParam, "base64url").toString());
  } catch {
    return NextResponse.redirect(oauthErrorUrl(source, "invalid_state"));
  }

  try {
    const { accessToken, expiresIn } = await exchangeAdsCodeForToken(code);
    const userInfo = await getMetaUserInfo(accessToken);
    const adAccounts = await discoverAdAccounts(accessToken);

    if (adAccounts.length === 0) {
      return NextResponse.redirect(oauthErrorUrl(state.source, "no_ad_accounts"));
    }

    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    const socialAccountId = await recordOAuthGrant({
      subscriptionId: state.subscription_id,
      platform: "meta_ads",
      userIdentifier: userInfo.id,
      userDisplayName: userInfo.name,
      accessToken,
      expiresAt,
      scopes: ADS_SCOPES,
      metadata: { user_name: userInfo.name },
    });

    const newAdAccountIds: string[] = [];
    for (const account of adAccounts) {
      const id = await recordAsset({
        socialAccountId,
        platform: "meta_ads",
        assetType: "meta_ad_account",
        assetId: account.id,
        assetName: account.name,
        metadata: {
          account_id: account.accountId,
          currency: account.currency,
          status: account.status,
          amount_spent: account.amountSpent,
        },
      });
      newAdAccountIds.push(id);
    }

    // Auto-assign on unambiguous 1-to-1 (subscription has 1 site,
    // OAuth brought back 1 ad account).
    const siteRows = await sql`
      SELECT id FROM sites WHERE subscription_id = ${state.subscription_id} LIMIT 2
    `;
    if (siteRows.length === 1 && newAdAccountIds.length === 1) {
      await assignSiteToAsset({
        siteId: siteRows[0].id as string,
        platformAssetId: newAdAccountIds[0],
        isPrimary: true,
      });
    }

    await sql`
      INSERT INTO usage_log (subscription_id, action, metadata)
      VALUES (${state.subscription_id}, 'meta_ads_connect', ${JSON.stringify({
        user_id: userInfo.id,
        user_name: userInfo.name,
        ad_accounts: adAccounts.map((a) => a.name),
      })})
    `;

    const names = adAccounts.map((a) => `Ads:${a.name}`).join(",");
    return NextResponse.redirect(oauthSuccessUrl(state.source, names, undefined, "meta_ads"));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Meta Ads OAuth callback error:", message);
    return NextResponse.redirect(oauthErrorUrl(state.source, "oauth_failed", message, undefined, "meta_ads"));
  }
}
