import { oauthSuccessUrl, oauthErrorUrl } from "@/lib/oauth-redirect";
import { markOnboardingPlatformIfNeeded } from "@/lib/onboarding/oauth-helpers";
import { NextRequest, NextResponse } from "next/server";
import { exchangeLinkedInCode, getLinkedInUserInfo, discoverLinkedInOrganizations } from "@/lib/linkedin";
import { sql } from "@/lib/db";
import { recordOAuthGrant, recordAsset } from "@/lib/platform-assets";

/**
 * GET /api/auth/linkedin/callback?code=xxx&state=xxx
 *
 * LinkedIn redirects here after the user authorizes. We:
 *   1. Exchange code for access + refresh tokens
 *   2. Identify the LinkedIn user (one social_accounts row per user per subscriber)
 *   3. Discover all organizations (Company Pages) the user admins
 *   4. Store the personal profile + each organization as platform_assets
 *   5. Site assignment is a separate step (operator picks which to publish as)
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
    return NextResponse.redirect(oauthErrorUrl(source, "linkedin_oauth_denied"));
  }

  if (!code || !stateParam) {
    return NextResponse.redirect(oauthErrorUrl(source, "missing_params"));
  }

  let state: { subscription_id: string; site_id?: string | null; source?: string; onboarding_token?: string };
  try {
    state = JSON.parse(Buffer.from(stateParam, "base64url").toString());
  } catch {
    return NextResponse.redirect(oauthErrorUrl(source, "invalid_state"));
  }

  try {
    const { accessToken, refreshToken, expiresIn } = await exchangeLinkedInCode(code);

    // 1. Identify the LinkedIn user
    let userName = "LinkedIn User";
    let userId = "";
    try {
      const userInfo = await getLinkedInUserInfo(accessToken);
      userName = userInfo.name;
      userId = userInfo.id;
    } catch (e) {
      console.warn("LinkedIn user info failed (non-fatal):", e instanceof Error ? e.message : e);
    }

    if (!userId) {
      return NextResponse.redirect(oauthErrorUrl(state.source, "linkedin_no_user_id"));
    }

    // 2. Discover organizations (Company Pages) the user admins
    const organizations = await discoverLinkedInOrganizations(accessToken);
    console.log("LinkedIn orgs discovered:", organizations.length);

    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // 3. Record one social_accounts row for this LinkedIn user grant
    const socialAccountId = await recordOAuthGrant({
      subscriptionId: state.subscription_id,
      platform: "linkedin",
      userIdentifier: userId,
      userDisplayName: userName,
      accessToken,
      refreshToken,
      expiresAt,
      scopes: [
        "openid",
        "profile",
        "w_member_social",
        "r_organization_social",
        "w_organization_social",
      ],
      metadata: { person_urn: `urn:li:person:${userId}` },
    });

    // 4. Record the personal profile as a platform_asset
    await recordAsset({
      socialAccountId,
      platform: "linkedin",
      assetType: "linkedin_person",
      assetId: userId,
      assetName: `${userName} (personal profile)`,
      metadata: { person_urn: `urn:li:person:${userId}` },
    });

    // 5. Record each organization as a platform_asset
    for (const org of organizations) {
      await recordAsset({
        socialAccountId,
        platform: "linkedin",
        assetType: "linkedin_organization",
        assetId: org.orgId,
        assetName: org.orgName,
        metadata: {
          org_urn: `urn:li:organization:${org.orgId}`,
          vanity_name: org.vanityName,
        },
      });
    }

    await sql`
      INSERT INTO usage_log (subscription_id, action, metadata)
      VALUES (${state.subscription_id}, 'linkedin_connect', ${JSON.stringify({
        user_id: userId,
        user_name: userName,
        organizations: organizations.map((o) => o.orgName),
      })})
    `;

    const allNames = [
      `${userName} (personal)`,
      ...organizations.map((o) => o.orgName),
    ];
    await markOnboardingPlatformIfNeeded(state, "linkedin", "connected");
    return NextResponse.redirect(
      oauthSuccessUrl(state.source, allNames.join(","), state.onboarding_token, "linkedin")
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("LinkedIn OAuth callback error:", message);
    await markOnboardingPlatformIfNeeded(state, "linkedin", "failed");
    return NextResponse.redirect(
      oauthErrorUrl(state.source, "linkedin_oauth_failed", message, state.onboarding_token, "linkedin")
    );
  }
}
