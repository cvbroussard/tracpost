import { oauthSuccessUrl, oauthErrorUrl } from "@/lib/oauth-redirect";
import { NextRequest, NextResponse } from "next/server";
import { exchangeLinkedInCode, getLinkedInUserInfo } from "@/lib/linkedin";
import { sql } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { studioUrl } from "@/lib/subdomains";

/**
 * GET /api/auth/linkedin/callback?code=xxx&state=xxx
 *
 * LinkedIn redirects here after the user authorizes. We:
 * 1. Exchange code for access + refresh tokens
 * 2. Fetch user profile via OpenID Connect
 * 3. Store encrypted credentials in social_accounts
 * 4. Redirect to dashboard
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const stateParam = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      `${studioUrl("/accounts")}?error=linkedin_oauth_denied`
    );
  }

  if (!code || !stateParam) {
    return NextResponse.redirect(
      `${studioUrl("/accounts")}?error=missing_params`
    );
  }

  let state: { subscriber_id: string; site_id?: string | null; source?: string };
  try {
    state = JSON.parse(Buffer.from(stateParam, "base64url").toString());
  } catch {
    return NextResponse.redirect(
      `${studioUrl("/accounts")}?error=invalid_state`
    );
  }

  try {
    const { accessToken, refreshToken, expiresIn } =
      await exchangeLinkedInCode(code);

    // Fetch user profile
    let accountName = "LinkedIn User";
    let accountId = "";
    let picture: string | undefined;
    try {
      const userInfo = await getLinkedInUserInfo(accessToken);
      accountName = userInfo.name;
      accountId = userInfo.sub;
      picture = userInfo.picture;
    } catch (e) {
      console.warn("LinkedIn user info failed (non-fatal):", e instanceof Error ? e.message : e);
    }

    // LinkedIn author URN for publishing
    const personUrn = accountId ? `urn:li:person:${accountId}` : "";

    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    await sql`
      INSERT INTO social_accounts (
        subscriber_id, platform, account_name, account_id,
        access_token_encrypted, refresh_token_encrypted, token_expires_at,
        scopes, status, metadata
      )
      VALUES (
        ${state.subscriber_id}, 'linkedin', ${accountName}, ${accountId},
        ${encrypt(accessToken)}, ${refreshToken ? encrypt(refreshToken) : null}, ${expiresAt},
        ${"{openid,profile,w_member_social}"},
        'active',
        ${JSON.stringify({ name: accountName, person_urn: personUrn, picture: picture || null })}
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

    // Auto-link to active channel
    if (state.site_id && accountId) {
      const [acct] = await sql`
        SELECT id FROM social_accounts
        WHERE subscriber_id = ${state.subscriber_id} AND platform = 'linkedin' AND account_id = ${accountId}
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
      INSERT INTO usage_log (subscriber_id, action, metadata)
      VALUES (${state.subscriber_id}, 'linkedin_connect', ${JSON.stringify({
        name: accountName,
      })})
    `;

    return NextResponse.redirect(
      oauthSuccessUrl(state.source, accountName)
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("LinkedIn OAuth callback error:", message);
    return NextResponse.redirect(
      oauthErrorUrl(state.source, "linkedin_oauth_failed", message)
    );
  }
}
