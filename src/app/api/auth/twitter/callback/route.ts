import { NextRequest, NextResponse } from "next/server";
import { exchangeTwitterCode, getTwitterUserInfo } from "@/lib/twitter";
import { sql } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { studioUrl } from "@/lib/subdomains";

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

  if (error) {
    return NextResponse.redirect(
      `${studioUrl("/accounts")}?error=twitter_oauth_denied`
    );
  }

  if (!code || !stateParam) {
    return NextResponse.redirect(
      `${studioUrl("/accounts")}?error=missing_params`
    );
  }

  let state: { subscriber_id: string; code_verifier: string };
  try {
    state = JSON.parse(Buffer.from(stateParam, "base64url").toString());
  } catch {
    return NextResponse.redirect(
      `${studioUrl("/accounts")}?error=invalid_state`
    );
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
        subscriber_id, platform, account_name, account_id,
        access_token_encrypted, refresh_token_encrypted, token_expires_at,
        scopes, status, metadata
      )
      VALUES (
        ${state.subscriber_id}, 'twitter', ${accountName}, ${accountId},
        ${encrypt(accessToken)}, ${encrypt(refreshToken)}, ${expiresAt},
        ${"{tweet.read,tweet.write,users.read,offline.access}"},
        'active',
        ${JSON.stringify({ username: accountName, user_id: accountId })}
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

    await sql`
      INSERT INTO usage_log (subscriber_id, action, metadata)
      VALUES (${state.subscriber_id}, 'twitter_connect', ${JSON.stringify({
        username: accountName,
      })})
    `;

    return NextResponse.redirect(
      `${studioUrl("/accounts")}?connected=${encodeURIComponent(accountName)}`
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Twitter OAuth callback error:", message);
    return NextResponse.redirect(
      `${studioUrl("/accounts")}?error=twitter_oauth_failed&detail=${encodeURIComponent(message.slice(0, 200))}`
    );
  }
}
