import { oauthSuccessUrl, oauthErrorUrl } from "@/lib/oauth-redirect";
import { markOnboardingPlatformIfNeeded } from "@/lib/onboarding/oauth-helpers";
import { NextRequest, NextResponse } from "next/server";
import {
  exchangeIgCodeForToken,
  exchangeIgShortForLong,
  getIgUserInfo,
  getGrantedScopes,
  missingRequiredScopes,
  IG_REQUIRED_SCOPES,
} from "@/lib/meta-ig";
import { sql } from "@/lib/db";
import {
  recordOAuthGrant,
  recordAsset,
  assignSiteToAsset,
} from "@/lib/platform-assets";

/**
 * GET /api/auth/visual-ig/callback?code=xxx&state=xxx
 *
 * Instagram redirects here after the user authorizes the TracPost —
 * Visual-IG app. Two-step token exchange (short → long-lived), partial-
 * grant rejection per policy, and storage as social_accounts row with
 * platform='meta_visual' to keep separate from organic 'meta' (FB) and
 * paid 'meta_ads' grants.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const stateParam = searchParams.get("state");
  const error = searchParams.get("error");

  let source: string | undefined;
  let onboardingToken: string | undefined;
  if (stateParam) {
    try {
      const parsed = JSON.parse(Buffer.from(stateParam, "base64url").toString());
      source = parsed.source;
      onboardingToken = parsed.onboarding_token;
    } catch { /* ignore */ }
  }

  if (error) {
    return NextResponse.redirect(oauthErrorUrl(source, "oauth_denied", undefined, onboardingToken, "visual_ig"));
  }
  if (!code || !stateParam) {
    return NextResponse.redirect(oauthErrorUrl(source, "missing_params", undefined, onboardingToken, "visual_ig"));
  }

  let state: { subscription_id: string; site_id?: string | null; source?: string; onboarding_token?: string };
  try {
    state = JSON.parse(Buffer.from(stateParam, "base64url").toString());
  } catch {
    return NextResponse.redirect(oauthErrorUrl(source, "invalid_state", undefined, onboardingToken, "visual_ig"));
  }

  try {
    // 1. Short-lived token exchange
    const { shortToken } = await exchangeIgCodeForToken(code);

    // 2. Long-lived (60-day) exchange
    const { accessToken, expiresIn } = await exchangeIgShortForLong(shortToken);

    // 3. Partial-grant policy: verify all required scopes were granted
    const grantedScopes = await getGrantedScopes(accessToken);
    const missing = missingRequiredScopes(grantedScopes);
    if (missing.length > 0) {
      const detail = `Missing required permissions: ${missing.join(", ")}. Reconnect with all toggles enabled.`;
      return NextResponse.redirect(
        oauthErrorUrl(state.source, "partial_grant", detail, state.onboarding_token, "visual_ig")
      );
    }

    // 4. Get user info to populate asset_name
    const userInfo = await getIgUserInfo(accessToken);

    // 5. Record OAuth grant under platform='meta_visual'
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    const socialAccountId = await recordOAuthGrant({
      subscriptionId: state.subscription_id,
      platform: "meta_visual",
      userIdentifier: userInfo.id,
      userDisplayName: userInfo.username,
      accessToken,
      expiresAt,
      scopes: IG_REQUIRED_SCOPES,
      metadata: {
        username: userInfo.username,
        name: userInfo.name,
        account_type: userInfo.accountType,
      },
    });

    // 6. Record IG asset
    const newIgAssetId = await recordAsset({
      socialAccountId,
      platform: "instagram",
      assetType: "instagram_account",
      assetId: userInfo.id,
      assetName: userInfo.username,
      metadata: {
        username: userInfo.username,
        account_type: userInfo.accountType,
        connection_path: "visual_ig",
        // page_access_token deliberately absent — IG Login API uses its
        // own token directly, no Page-token dependency for organic
        // publishing. Page link state for paid IG ads is verified at
        // boost-time via Marketing API.
      },
    });

    // 7. Auto-assign on single-site
    const siteRows = await sql`
      SELECT id FROM sites WHERE subscription_id = ${state.subscription_id} LIMIT 2
    `;
    if (siteRows.length === 1) {
      await assignSiteToAsset({
        siteId: siteRows[0].id as string,
        platformAssetId: newIgAssetId,
        isPrimary: true,
      });
    }

    // 8. Usage log
    await sql`
      INSERT INTO usage_log (subscription_id, action, metadata)
      VALUES (${state.subscription_id}, 'meta_visual_connect', ${JSON.stringify({
        ig_user_id: userInfo.id,
        username: userInfo.username,
        account_type: userInfo.accountType,
      })})
    `;

    await markOnboardingPlatformIfNeeded(state, "visual_ig", "connected");
    return NextResponse.redirect(
      oauthSuccessUrl(state.source, `IG:${userInfo.username}`, state.onboarding_token, "visual_ig")
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Visual-IG OAuth callback error:", message);
    await markOnboardingPlatformIfNeeded(state, "visual_ig", "failed");
    return NextResponse.redirect(
      oauthErrorUrl(state.source, "oauth_failed", message, state.onboarding_token, "visual_ig")
    );
  }
}
