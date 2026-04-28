import { NextRequest, NextResponse } from "next/server";
import { exchangeGoogleCode, discoverGbpLocations } from "@/lib/google";
import { sql } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { oauthErrorUrl, oauthSuccessUrl } from "@/lib/oauth-redirect";
import { markOnboardingPlatformIfNeeded } from "@/lib/onboarding/oauth-helpers";
import { recordOAuthGrant, recordAsset } from "@/lib/platform-assets";

/**
 * GET /api/auth/google/callback?code=xxx&state=xxx
 *
 * Google redirects here after the user authorizes. We:
 *   1. Exchange code for access + refresh tokens
 *   2. Identify the Google user (one social_accounts row per user per subscriber)
 *   3. Discover all GBP locations the token can access
 *   4. Store each location as a platform_asset
 *   5. Site assignment is a separate step (operator picks the location via UI)
 *
 * gbp_credentials is also written for backward compatibility with code that
 * still reads from it (search-console, page-scores, etc).
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

  let state: { subscription_id: string; site_id: string; source?: string; onboarding_token?: string };
  try {
    state = JSON.parse(Buffer.from(stateParam, "base64url").toString());
  } catch {
    return NextResponse.redirect(oauthErrorUrl(source, "invalid_state"));
  }

  try {
    const { accessToken, refreshToken, expiresIn, email, googleAccountId } =
      await exchangeGoogleCode(code);
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // 1. Discover what this token can access
    const locations = await discoverGbpLocations(accessToken);
    console.log("Google OAuth — discovered GBP locations:", locations.length);

    // 2. Record one social_accounts row for this Google user grant
    const socialAccountId = await recordOAuthGrant({
      subscriptionId: state.subscription_id,
      platform: "google",
      userIdentifier: googleAccountId,
      userDisplayName: email,
      accessToken,
      refreshToken,
      expiresAt,
      scopes: ["business.manage", "userinfo.email", "webmasters.readonly"],
      metadata: { google_account_id: googleAccountId, email },
    });

    // 3. Record each accessible location as a platform_asset
    for (const loc of locations) {
      await recordAsset({
        socialAccountId,
        platform: "gbp",
        assetType: "gbp_location",
        assetId: loc.locationId,
        assetName: loc.locationName,
        metadata: {
          accountId: loc.accountId,
          address: loc.address,
        },
      });
    }

    // Backward compatibility: still write to gbp_credentials so search-console
    // and page-scores code that reads from it keeps working until those are
    // refactored.
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

    // Notify operator that locations need assignment
    const [site] = await sql`SELECT name FROM sites WHERE id = ${state.site_id}`;
    const siteName = (site?.name as string) || "Unknown site";
    try {
      const locationNames = locations.map((l) => l.locationName).join(", ");
      await sql`
        INSERT INTO notifications (
          subscription_id, category, severity, title, body, metadata
        ) VALUES (
          ${state.subscription_id}, 'campaigns', 'info',
          ${"Google connected — assign location to site"},
          ${`${siteName} initiated Google connection (${email}). ${locations.length} location${locations.length !== 1 ? "s" : ""} discovered: ${locationNames}. Assign the correct location to each site in Manage → Site Connections.`},
          ${JSON.stringify({
            type: "gbp_pending_assignment",
            site_id: state.site_id,
            social_account_id: socialAccountId,
            location_count: locations.length,
          })}
        )
      `;
    } catch { /* non-fatal */ }

    // Log usage
    await sql`
      INSERT INTO usage_log (subscription_id, action, metadata)
      VALUES (${state.subscription_id}, 'google_connect', ${JSON.stringify({
        google_account_id: googleAccountId,
        email,
        locations: locations.map((l) => l.locationName),
      })})
    `;

    await markOnboardingPlatformIfNeeded(state, "gbp", "connected");
    return NextResponse.redirect(
      oauthSuccessUrl(state.source, `Google (${locations.length} location${locations.length !== 1 ? "s" : ""})`, state.onboarding_token, "gbp")
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Google OAuth callback error:", message);
    await markOnboardingPlatformIfNeeded(state, "gbp", "failed");
    return NextResponse.redirect(
      oauthErrorUrl(state.source, "google_oauth_failed", message, state.onboarding_token, "gbp")
    );
  }
}
