import { oauthSuccessUrl, oauthErrorUrl } from "@/lib/oauth-redirect";
import { NextRequest, NextResponse } from "next/server";
import {
  exchangeCodeForToken,
  discoverInstagramAccounts,
  discoverFacebookPages,
  getMetaUserInfo,
} from "@/lib/meta";
import { sql } from "@/lib/db";
import { recordOAuthGrant, recordAsset } from "@/lib/platform-assets";

/**
 * GET /api/auth/instagram/callback?code=xxx&state=xxx
 *
 * Meta redirects here after the user authorizes. We:
 *   1. Exchange code for long-lived user access token
 *   2. Identify the Meta user (one social_accounts row per Meta user per subscriber)
 *   3. Discover all Instagram accounts and Facebook Pages the token can access
 *   4. Store each as a platform_asset under the social_accounts row
 *   5. Site assignment is now a separate step (operator picks the asset via UI)
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

  let state: { subscription_id: string; site_id?: string | null; source?: string; page_ids?: string[] };
  try {
    state = JSON.parse(Buffer.from(stateParam, "base64url").toString());
  } catch {
    return NextResponse.redirect(oauthErrorUrl(source, "invalid_state"));
  }

  try {
    const { accessToken, expiresIn } = await exchangeCodeForToken(code);
    console.log("OAuth callback — token obtained, expires in:", expiresIn);

    // 1. Identify the Meta user
    const userInfo = await getMetaUserInfo(accessToken);
    console.log("OAuth callback — Meta user:", userInfo);

    // 2. Discover what this token can access
    const igAccounts = await discoverInstagramAccounts(accessToken, state.page_ids);
    const fbPages = await discoverFacebookPages(accessToken, state.page_ids);
    console.log("OAuth callback — IG accounts:", igAccounts.length, "FB pages:", fbPages.length);

    if (igAccounts.length === 0 && fbPages.length === 0) {
      return NextResponse.redirect(oauthErrorUrl(state.source, "no_assets"));
    }

    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // 3. Record one social_accounts row for this Meta user grant
    const socialAccountId = await recordOAuthGrant({
      subscriptionId: state.subscription_id,
      platform: "meta",
      userIdentifier: userInfo.id,
      userDisplayName: userInfo.name,
      accessToken,
      expiresAt,
      scopes: [
        "instagram_basic",
        "instagram_content_publish",
        "pages_manage_posts",
        "pages_read_engagement",
        "pages_show_list",
      ],
      metadata: { user_name: userInfo.name },
    });

    // 4. Record each accessible asset
    for (const fb of fbPages) {
      await recordAsset({
        socialAccountId,
        platform: "facebook",
        assetType: "facebook_page",
        assetId: fb.pageId,
        assetName: fb.pageName,
        metadata: {
          page_access_token: fb.pageAccessToken, // page-specific token for publishing
        },
      });
    }

    for (const ig of igAccounts) {
      // Find the matching FB page's access token (IG publishing uses Page token)
      const linkedPage = fbPages.find((p) => p.pageId === ig.pageId);
      await recordAsset({
        socialAccountId,
        platform: "instagram",
        assetType: "instagram_account",
        assetId: ig.igUserId,
        assetName: ig.igUsername,
        metadata: {
          page_id: ig.pageId,
          page_name: ig.pageName,
          page_access_token: linkedPage?.pageAccessToken || null,
        },
      });
    }

    // Log usage
    await sql`
      INSERT INTO usage_log (subscription_id, action, metadata)
      VALUES (${state.subscription_id}, 'meta_connect', ${JSON.stringify({
        user_id: userInfo.id,
        user_name: userInfo.name,
        ig_accounts: igAccounts.map((a) => a.igUsername),
        fb_pages: fbPages.map((p) => p.pageName),
      })})
    `;

    const allNames = [
      ...igAccounts.map((a) => `IG:${a.igUsername}`),
      ...fbPages.map((p) => `FB:${p.pageName}`),
    ];
    return NextResponse.redirect(oauthSuccessUrl(state.source, allNames.join(",")));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Meta OAuth callback error:", message);
    return NextResponse.redirect(oauthErrorUrl(state.source, "oauth_failed", message));
  }
}
