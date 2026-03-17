import { NextRequest, NextResponse } from "next/server";
import { exchangeTikTokCode, getTikTokUserInfo } from "@/lib/tiktok";
import { sql } from "@/lib/db";
import { studioUrl } from "@/lib/subdomains";

/**
 * GET /api/auth/tiktok/callback?code=xxx&state=xxx
 *
 * TikTok redirects here after the user authorizes. We:
 * 1. Exchange code for access + refresh tokens
 * 2. Fetch user profile info
 * 3. Store credentials in social_accounts
 * 4. Redirect to dashboard
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const stateParam = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      `${studioUrl("/accounts")}?error=tiktok_oauth_denied`
    );
  }

  if (!code || !stateParam) {
    return NextResponse.redirect(
      `${studioUrl("/accounts")}?error=missing_params`
    );
  }

  let state: { subscriber_id: string };
  try {
    state = JSON.parse(Buffer.from(stateParam, "base64url").toString());
  } catch {
    return NextResponse.redirect(
      `${studioUrl("/accounts")}?error=invalid_state`
    );
  }

  try {
    // Exchange code for tokens
    const { accessToken, refreshToken, expiresIn, openId } =
      await exchangeTikTokCode(code);

    // Fetch user profile
    const userInfo = await getTikTokUserInfo(accessToken);
    const accountName = userInfo.username || userInfo.displayName || openId;

    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Store in social_accounts
    await sql`
      INSERT INTO social_accounts (
        subscriber_id, platform, account_name, account_id,
        access_token_encrypted, refresh_token_encrypted, token_expires_at,
        scopes, status, metadata
      )
      VALUES (
        ${state.subscriber_id}, 'tiktok', ${accountName}, ${openId},
        ${accessToken}, ${refreshToken}, ${expiresAt},
        ${"{user.info.basic,video.publish,video.upload}"},
        'active',
        ${JSON.stringify({
          open_id: openId,
          username: userInfo.username,
          display_name: userInfo.displayName,
          avatar_url: userInfo.avatarUrl,
        })}
      )
      ON CONFLICT (subscriber_id, platform, account_id)
      DO UPDATE SET
        account_name = EXCLUDED.account_name,
        access_token_encrypted = EXCLUDED.access_token_encrypted,
        refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
        token_expires_at = EXCLUDED.token_expires_at,
        scopes = EXCLUDED.scopes,
        status = 'active',
        metadata = EXCLUDED.metadata,
        updated_at = NOW()
    `;

    // Log usage
    await sql`
      INSERT INTO usage_log (subscriber_id, action, metadata)
      VALUES (${state.subscriber_id}, 'tiktok_connect', ${JSON.stringify({
        username: userInfo.username,
        display_name: userInfo.displayName,
      })})
    `;

    return NextResponse.redirect(
      `${studioUrl("/accounts")}?connected=${encodeURIComponent(accountName || "TikTok")}`
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("TikTok OAuth callback error:", message);
    return NextResponse.redirect(
      `${studioUrl("/accounts")}?error=tiktok_oauth_failed&detail=${encodeURIComponent(message.slice(0, 200))}`
    );
  }
}
