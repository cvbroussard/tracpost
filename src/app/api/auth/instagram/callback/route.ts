import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForToken, discoverInstagramAccounts } from "@/lib/meta";
import { sql } from "@/lib/db";

/**
 * GET /api/auth/instagram/callback?code=xxx&state=xxx
 *
 * Meta redirects here after the user authorizes. We:
 * 1. Exchange code for long-lived token
 * 2. Discover Instagram Business accounts linked to their pages
 * 3. Store credentials in social_accounts
 * 4. Redirect to dashboard with success message
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const stateParam = searchParams.get("state");
  const error = searchParams.get("error");

  // Handle user denial
  if (error) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/social?error=oauth_denied`
    );
  }

  if (!code || !stateParam) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/social?error=missing_params`
    );
  }

  // Decode state
  let state: { site_id: string; subscriber_id: string };
  try {
    state = JSON.parse(Buffer.from(stateParam, "base64url").toString());
  } catch {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/social?error=invalid_state`
    );
  }

  try {
    // Exchange code for long-lived token
    const { accessToken, expiresIn } = await exchangeCodeForToken(code);

    // Discover Instagram accounts
    const igAccounts = await discoverInstagramAccounts(accessToken);

    if (igAccounts.length === 0) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/social?error=no_ig_account`
      );
    }

    // Store each discovered IG account
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    for (const ig of igAccounts) {
      await sql`
        INSERT INTO social_accounts (
          site_id, platform, account_name, account_id,
          access_token_encrypted, token_expires_at,
          scopes, status, metadata
        )
        VALUES (
          ${state.site_id}, 'instagram', ${ig.igUsername}, ${ig.igUserId},
          ${accessToken}, ${expiresAt},
          ${'{instagram_basic,instagram_content_publish,instagram_manage_comments,instagram_manage_insights,pages_show_list,pages_read_engagement}'},
          'active',
          ${JSON.stringify({ page_id: ig.pageId, page_name: ig.pageName })}
        )
        ON CONFLICT (site_id, platform, account_id)
        DO UPDATE SET
          account_name = EXCLUDED.account_name,
          access_token_encrypted = EXCLUDED.access_token_encrypted,
          token_expires_at = EXCLUDED.token_expires_at,
          scopes = EXCLUDED.scopes,
          status = 'active',
          metadata = EXCLUDED.metadata,
          updated_at = NOW()
      `;
    }

    // Log usage
    await sql`
      INSERT INTO usage_log (subscriber_id, site_id, action, metadata)
      VALUES (${state.subscriber_id}, ${state.site_id}, 'instagram_connect', ${JSON.stringify({
        accounts: igAccounts.map((a) => a.igUsername),
      })})
    `;

    const accountNames = igAccounts.map((a) => a.igUsername).join(",");
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/social?connected=${encodeURIComponent(accountNames)}`
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Instagram OAuth callback error:", message);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/social?error=oauth_failed`
    );
  }
}
