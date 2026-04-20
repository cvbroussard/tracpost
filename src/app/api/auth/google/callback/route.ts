import { NextRequest, NextResponse } from "next/server";
import { exchangeGoogleCode, discoverGbpLocations } from "@/lib/google";
import { sql } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { oauthErrorUrl, oauthSuccessUrl } from "@/lib/oauth-redirect";

/**
 * GET /api/auth/google/callback?code=xxx&state=xxx
 *
 * Google redirects here after the user authorizes. We:
 * 1. Exchange code for access + refresh tokens
 * 2. Store credentials in gbp_credentials
 * 3. Discover GBP locations
 * 4. Store ONE social_account with status 'pending_assignment'
 *    (token + all discovered locations in metadata)
 * 5. Notify operator to assign the correct location
 * 6. Redirect tenant back to Connections (shows "Pending")
 *
 * The operator then picks the correct location from the admin panel,
 * which creates the site_social_link and activates the connection.
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
    return NextResponse.redirect(oauthErrorUrl(source, "google_oauth_denied"));
  }

  if (!code || !stateParam) {
    return NextResponse.redirect(oauthErrorUrl(source, "missing_params"));
  }

  let state: { subscription_id: string; site_id: string; source?: string };
  try {
    state = JSON.parse(Buffer.from(stateParam, "base64url").toString());
  } catch {
    return NextResponse.redirect(oauthErrorUrl(source, "invalid_state"));
  }

  try {
    const { accessToken, refreshToken, expiresIn, email, googleAccountId } =
      await exchangeGoogleCode(code);

    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Store credentials
    await sql`
      INSERT INTO gbp_credentials (
        site_id, google_account_id, google_email,
        access_token, refresh_token, token_expires_at,
        scopes, is_active
      )
      VALUES (
        ${state.site_id}, ${googleAccountId}, ${email},
        ${encrypt(accessToken)}, ${encrypt(refreshToken)}, ${expiresAt},
        ${"{business.manage,userinfo.email,webmasters.readonly}"},
        true
      )
      ON CONFLICT (site_id)
      DO UPDATE SET
        google_account_id = EXCLUDED.google_account_id,
        google_email = EXCLUDED.google_email,
        access_token = EXCLUDED.access_token,
        refresh_token = EXCLUDED.refresh_token,
        token_expires_at = EXCLUDED.token_expires_at,
        scopes = EXCLUDED.scopes,
        is_active = true,
        updated_at = NOW()
    `;

    // Discover locations
    const locations = await discoverGbpLocations(accessToken);

    // Get site name for the notification
    const [site] = await sql`SELECT name FROM sites WHERE id = ${state.site_id}`;
    const siteName = (site?.name as string) || "Unknown site";

    // Store a SINGLE social_account with pending status
    // All discovered locations stored in metadata for the operator picker
    const [socialAccount] = await sql`
      INSERT INTO social_accounts (
        subscription_id, platform, account_name, account_id,
        access_token_encrypted, refresh_token_encrypted, token_expires_at,
        scopes, status, metadata
      )
      VALUES (
        ${state.subscription_id}, 'gbp',
        ${email},
        ${"pending_" + state.site_id},
        ${encrypt(accessToken)}, ${encrypt(refreshToken)}, ${expiresAt},
        ${"{business.manage}"},
        'pending_assignment',
        ${JSON.stringify({
          google_account_id: googleAccountId,
          google_email: email,
          initiating_site_id: state.site_id,
          initiating_site_name: siteName,
          discovered_locations: locations.map((loc) => ({
            accountId: loc.accountId,
            locationId: loc.locationId,
            locationName: loc.locationName,
            address: loc.address,
          })),
        })}
      )
      ON CONFLICT (subscription_id, platform, account_id)
      DO UPDATE SET
        account_name = EXCLUDED.account_name,
        access_token_encrypted = EXCLUDED.access_token_encrypted,
        refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
        token_expires_at = EXCLUDED.token_expires_at,
        status = 'pending_assignment',
        metadata = EXCLUDED.metadata,
        updated_at = NOW()
      RETURNING id
    `;

    // Link to the initiating site so it shows in the tenant's Connections
    if (socialAccount) {
      await sql`
        INSERT INTO site_social_links (site_id, social_account_id)
        VALUES (${state.site_id}, ${socialAccount.id})
        ON CONFLICT DO NOTHING
      `;
    }

    // Notify operator
    try {
      const locationNames = locations.map((l) => l.locationName).join(", ");
      await sql`
        INSERT INTO notifications (
          subscription_id, category, severity, title, body, metadata
        ) VALUES (
          ${state.subscription_id}, 'campaigns', 'info',
          ${"Google Business connected — assign location"},
          ${`${siteName} connected Google Business (${email}). ${locations.length} location${locations.length !== 1 ? "s" : ""} discovered: ${locationNames}. Assign the correct location in the admin panel.`},
          ${JSON.stringify({
            type: "gbp_pending_assignment",
            site_id: state.site_id,
            social_account_id: socialAccount?.id,
            location_count: locations.length,
          })}
        )
      `;
    } catch { /* non-fatal */ }

    // Log usage
    await sql`
      INSERT INTO usage_log (subscription_id, action, metadata)
      VALUES (${state.subscription_id}, 'google_connect', ${JSON.stringify({
        locations: locations.map((l) => l.locationName),
        email,
        status: "pending_assignment",
      })})
    `;

    return NextResponse.redirect(
      oauthSuccessUrl(state.source, "Google Business (pending location assignment)")
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Google OAuth callback error:", message);
    return NextResponse.redirect(
      oauthErrorUrl(state.source, "google_oauth_failed", message)
    );
  }
}
