import { oauthSuccessUrl, oauthErrorUrl } from "@/lib/oauth-redirect";
import { markOnboardingPlatformIfNeeded } from "@/lib/onboarding/oauth-helpers";
import { NextRequest, NextResponse } from "next/server";
import { exchangeYouTubeCode, discoverYouTubeChannel } from "@/lib/youtube";
import { sql } from "@/lib/db";
import { encrypt } from "@/lib/crypto";

/**
 * GET /api/auth/youtube/callback?code=xxx&state=xxx
 *
 * Google redirects here after YouTube OAuth. We:
 * 1. Exchange code for tokens
 * 2. Discover YouTube channel
 * 3. Store encrypted credentials in social_accounts
 * 4. Auto-link to active channel
 * 5. Redirect to dashboard
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const stateParam = searchParams.get("state");
  const error = searchParams.get("error");

  // Parse source early for error redirects
  let source: string | undefined;
  if (stateParam) {
    try {
      const parsed = JSON.parse(Buffer.from(stateParam, "base64url").toString());
      source = parsed.source;
    } catch { /* ignore */ }
  }

  if (error) {
    return NextResponse.redirect(oauthErrorUrl(source, "youtube_oauth_denied"));
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
    const { accessToken, refreshToken, expiresIn, email } =
      await exchangeYouTubeCode(code);

    // Discover YouTube channel
    let accountName = email || "YouTube User";
    let accountId = email;
    let channelMeta: Record<string, string> = { email };

    try {
      const channel = await discoverYouTubeChannel(accessToken);
      if (channel) {
        accountName = channel.channelTitle || channel.customUrl || email;
        accountId = channel.channelId;
        channelMeta = {
          email,
          channel_id: channel.channelId,
          channel_title: channel.channelTitle,
          custom_url: channel.customUrl,
        };
      }
    } catch (e) {
      console.warn("YouTube channel discovery failed (non-fatal):", e instanceof Error ? e.message : e);
    }

    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    await sql`
      INSERT INTO social_accounts (
        subscription_id, platform, account_name, account_id,
        access_token_encrypted, refresh_token_encrypted, token_expires_at,
        scopes, status, metadata
      )
      VALUES (
        ${state.subscription_id}, 'youtube', ${accountName}, ${accountId},
        ${encrypt(accessToken)}, ${encrypt(refreshToken)}, ${expiresAt},
        ${"{youtube.upload,youtube.readonly,userinfo.email}"},
        'active',
        ${JSON.stringify(channelMeta)}
      )
      ON CONFLICT (subscription_id, platform, account_id)
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

    // Auto-link to active channel
    if (state.site_id && accountId) {
      const [acct] = await sql`
        SELECT id FROM social_accounts
        WHERE subscription_id = ${state.subscription_id} AND platform = 'youtube' AND account_id = ${accountId}
      `;
      if (acct) {
        await sql`
          INSERT INTO site_social_links (site_id, social_account_id)
          VALUES (${state.site_id}, ${acct.id})
          ON CONFLICT DO NOTHING
        `;
      }
    }

    await sql`
      INSERT INTO usage_log (subscription_id, action, metadata)
      VALUES (${state.subscription_id}, 'youtube_connect', ${JSON.stringify({
        channel: accountName,
        email,
      })})
    `;

    await markOnboardingPlatformIfNeeded(state, "youtube", "connected");
    return NextResponse.redirect(
      oauthSuccessUrl(state.source, accountName, state.onboarding_token, "youtube")
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("YouTube OAuth callback error:", message);
    await markOnboardingPlatformIfNeeded(state, "youtube", "failed");
    return NextResponse.redirect(
      oauthErrorUrl(state.source, "youtube_oauth_failed", message, state.onboarding_token, "youtube")
    );
  }
}
