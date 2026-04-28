import { oauthSuccessUrl, oauthErrorUrl } from "@/lib/oauth-redirect";
import { markOnboardingPlatformIfNeeded } from "@/lib/onboarding/oauth-helpers";
import { NextRequest, NextResponse } from "next/server";
import { exchangeTwitterCode, getTwitterUserInfo } from "@/lib/twitter";
import { sql } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
/**
 * GET /api/auth/twitter/callback?code=xxx&state=xxx
 *
 * X redirects here after the user authorizes. We:
 * 1. Extract code_verifier from state (PKCE)
 * 2. Exchange code for access + refresh tokens
 * 3. Fetch user profile
 * 4. Store encrypted credentials in social_accounts
 * 5. Redirect to dashboard
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const stateParam = searchParams.get("state");
  const error = searchParams.get("error");

  // Try to parse state early so error redirects respect source
  let source: string | undefined;
  if (stateParam) {
    try {
      const parsed = JSON.parse(Buffer.from(stateParam, "base64url").toString());
      source = parsed.source;
    } catch { /* ignore */ }
  }

  if (error) {
    return NextResponse.redirect(oauthErrorUrl(source, "twitter_oauth_denied"));
  }

  if (!code || !stateParam) {
    return NextResponse.redirect(oauthErrorUrl(source, "missing_params"));
  }

  let state: { subscription_id: string; site_id?: string | null; source?: string; onboarding_token?: string; code_verifier: string };
  try {
    state = JSON.parse(Buffer.from(stateParam, "base64url").toString());
  } catch {
    return NextResponse.redirect(oauthErrorUrl(source, "invalid_state"));
  }

  try {
    const { accessToken, refreshToken, expiresIn } =
      await exchangeTwitterCode(code, state.code_verifier);

    // Fetch user profile
    let accountName = "X User";
    let accountId = "";
    try {
      const userInfo = await getTwitterUserInfo(accessToken);
      accountName = userInfo.username;
      accountId = userInfo.id;
    } catch (e) {
      console.warn("Twitter user info failed (non-fatal):", e instanceof Error ? e.message : e);
    }

    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    await sql`
      INSERT INTO social_accounts (
        subscription_id, platform, account_name, account_id,
        access_token_encrypted, refresh_token_encrypted, token_expires_at,
        scopes, status, metadata
      )
      VALUES (
        ${state.subscription_id}, 'twitter', ${accountName}, ${accountId},
        ${encrypt(accessToken)}, ${encrypt(refreshToken)}, ${expiresAt},
        ${"{tweet.read,tweet.write,users.read,offline.access}"},
        'active',
        ${JSON.stringify({ username: accountName, user_id: accountId })}
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
        WHERE subscription_id = ${state.subscription_id} AND platform = 'twitter' AND account_id = ${accountId}
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
      VALUES (${state.subscription_id}, 'twitter_connect', ${JSON.stringify({
        username: accountName,
      })})
    `;

    await markOnboardingPlatformIfNeeded(state, "twitter", "connected");
    return NextResponse.redirect(
      oauthSuccessUrl(state.source, accountName, state.onboarding_token, "twitter")
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Twitter OAuth callback error:", message);
    await markOnboardingPlatformIfNeeded(state, "twitter", "failed");
    return NextResponse.redirect(
      oauthErrorUrl(state.source, "twitter_oauth_failed", message, state.onboarding_token, "twitter")
    );
  }
}
