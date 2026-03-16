import { NextRequest, NextResponse } from "next/server";
import { exchangeGoogleCode, discoverGbpLocations } from "@/lib/google";
import { sql } from "@/lib/db";
import { studioUrl } from "@/lib/subdomains";

/**
 * GET /api/auth/google/callback?code=xxx&state=xxx
 *
 * Google redirects here after the user authorizes. We:
 * 1. Exchange code for access + refresh tokens
 * 2. Discover GBP locations
 * 3. Store credentials in gbp_credentials
 * 4. Store locations in gbp_locations
 * 5. Create social_accounts entry for each location
 * 6. Redirect to dashboard
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const stateParam = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      `${studioUrl("/accounts")}?error=google_oauth_denied`
    );
  }

  if (!code || !stateParam) {
    return NextResponse.redirect(
      `${studioUrl("/accounts")}?error=missing_params`
    );
  }

  let state: { subscriber_id: string; site_id: string };
  try {
    state = JSON.parse(Buffer.from(stateParam, "base64url").toString());
  } catch {
    return NextResponse.redirect(
      `${studioUrl("/accounts")}?error=invalid_state`
    );
  }

  try {
    // Exchange code for tokens
    const { accessToken, refreshToken, expiresIn, email, googleAccountId } =
      await exchangeGoogleCode(code);

    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Store credentials in gbp_credentials
    await sql`
      INSERT INTO gbp_credentials (
        site_id, google_account_id, google_email,
        access_token, refresh_token, token_expires_at,
        scopes, is_active
      )
      VALUES (
        ${state.site_id}, ${googleAccountId}, ${email},
        ${accessToken}, ${refreshToken}, ${expiresAt},
        ${"business.manage,userinfo.email"},
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

    // Discover GBP locations
    const locations = await discoverGbpLocations(accessToken);

    // Store locations and create social_accounts entries
    for (const loc of locations) {
      // Store in gbp_locations
      await sql`
        INSERT INTO gbp_locations (
          site_id, external_id, gbp_account_id, gbp_location_id,
          sync_status, sync_data
        )
        VALUES (
          ${state.site_id}, ${loc.locationId}, ${loc.accountId}, ${loc.locationId},
          'synced', ${JSON.stringify({ name: loc.locationName, address: loc.address })}
        )
        ON CONFLICT DO NOTHING
      `;

      // Create social_account for the pipeline to publish through
      await sql`
        INSERT INTO social_accounts (
          subscriber_id, platform, account_name, account_id,
          access_token_encrypted, token_expires_at,
          scopes, status, metadata
        )
        VALUES (
          ${state.subscriber_id}, 'gbp', ${loc.locationName}, ${loc.locationId},
          ${accessToken}, ${expiresAt},
          ${"business.manage"},
          'active',
          ${JSON.stringify({
            google_account_id: googleAccountId,
            google_email: email,
            account_id: loc.accountId,
            location_id: loc.locationId,
            location_name: loc.locationName,
            address: loc.address,
            site_id: state.site_id,
          })}
        )
        ON CONFLICT (subscriber_id, platform, account_id)
        DO UPDATE SET
          account_name = EXCLUDED.account_name,
          access_token_encrypted = EXCLUDED.access_token_encrypted,
          token_expires_at = EXCLUDED.token_expires_at,
          status = 'active',
          metadata = EXCLUDED.metadata,
          updated_at = NOW()
      `;
    }

    // Log usage
    await sql`
      INSERT INTO usage_log (subscriber_id, action, metadata)
      VALUES (${state.subscriber_id}, 'google_connect', ${JSON.stringify({
        locations: locations.map((l) => l.locationName),
        email,
      })})
    `;

    const locationNames = locations.map((l) => l.locationName).join(",");
    return NextResponse.redirect(
      `${studioUrl("/accounts")}?connected=${encodeURIComponent(locationNames || "Google Business")}`
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Google OAuth callback error:", message);
    return NextResponse.redirect(
      `${studioUrl("/accounts")}?error=google_oauth_failed`
    );
  }
}
