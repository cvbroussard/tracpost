import { oauthSuccessUrl, oauthErrorUrl } from "@/lib/oauth-redirect";
import { markOnboardingPlatformIfNeeded } from "@/lib/onboarding/oauth-helpers";
import { NextRequest, NextResponse } from "next/server";
import { exchangePinterestCode, getPinterestUserInfo, getPinterestBoards } from "@/lib/pinterest";
import { sql } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
/**
 * GET /api/auth/pinterest/callback?code=xxx&state=xxx
 *
 * Pinterest redirects here after the user authorizes. We:
 * 1. Exchange code for access + refresh tokens
 * 2. Fetch user profile + boards
 * 3. Store encrypted credentials in social_accounts
 * 4. Redirect to dashboard
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
    return NextResponse.redirect(oauthErrorUrl(source, "pinterest_oauth_denied"));
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
    const { accessToken, refreshToken, expiresIn } =
      await exchangePinterestCode(code);

    // Fetch user profile
    let accountName = "Pinterest User";
    try {
      const userInfo = await getPinterestUserInfo(accessToken);
      accountName = userInfo.username || accountName;
    } catch (e) {
      console.warn("Pinterest user info failed (non-fatal):", e instanceof Error ? e.message : e);
    }

    // Fetch boards for publishing (store first board as default)
    let boards: Array<{ id: string; name: string; description: string }> = [];
    try {
      boards = await getPinterestBoards(accessToken);
    } catch (e) {
      console.warn("Pinterest boards fetch failed (non-fatal):", e instanceof Error ? e.message : e);
    }

    const defaultBoard = boards[0] || null;
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    await sql`
      INSERT INTO social_accounts (
        subscription_id, platform, account_name, account_id,
        access_token_encrypted, refresh_token_encrypted, token_expires_at,
        scopes, status, metadata
      )
      VALUES (
        ${state.subscription_id}, 'pinterest', ${accountName}, ${accountName},
        ${encrypt(accessToken)}, ${encrypt(refreshToken)}, ${expiresAt},
        ${"{boards:read,pins:read,pins:write,user_accounts:read}"},
        'active',
        ${JSON.stringify({
          username: accountName,
          boards: boards.map((b) => ({ id: b.id, name: b.name })),
          default_board_id: defaultBoard?.id || null,
          board_id: defaultBoard?.id || null,
        })}
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
    if (state.site_id) {
      const [acct] = await sql`
        SELECT id FROM social_accounts
        WHERE subscription_id = ${state.subscription_id} AND platform = 'pinterest' AND account_id = ${accountName}
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
      VALUES (${state.subscription_id}, 'pinterest_connect', ${JSON.stringify({
        username: accountName,
        boards: boards.length,
      })})
    `;

    await markOnboardingPlatformIfNeeded(state, "pinterest", "connected");
    return NextResponse.redirect(
      oauthSuccessUrl(state.source, accountName, state.onboarding_token, "pinterest")
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Pinterest OAuth callback error:", message);
    await markOnboardingPlatformIfNeeded(state, "pinterest", "failed");
    return NextResponse.redirect(
      oauthErrorUrl(state.source, "pinterest_oauth_failed", message, state.onboarding_token, "pinterest")
    );
  }
}
