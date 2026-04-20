import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { encrypt, decrypt } from "@/lib/crypto";

/**
 * GET /api/google/link-locations?site_id=xxx
 * Returns pending GBP connections and discovered locations for assignment.
 *
 * POST /api/google/link-locations
 * Body: { social_account_id, site_id, location_index }
 * Assigns a specific discovered location to the site, activates the connection.
 */
export async function GET(req: NextRequest) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (adminCookie !== "authenticated") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const siteId = new URL(req.url).searchParams.get("site_id");

  // Get pending GBP connections
  const pending = siteId
    ? await sql`
        SELECT sa.id, sa.account_name, sa.status, sa.metadata
        FROM social_accounts sa
        JOIN site_social_links ssl ON ssl.social_account_id = sa.id
        WHERE ssl.site_id = ${siteId}
          AND sa.platform = 'gbp'
          AND sa.status = 'pending_assignment'
      `
    : await sql`
        SELECT sa.id, sa.account_name, sa.status, sa.metadata
        FROM social_accounts sa
        WHERE sa.platform = 'gbp'
          AND sa.status = 'pending_assignment'
      `;

  return NextResponse.json({
    pending: pending.map((p) => ({
      id: p.id,
      email: p.account_name,
      status: p.status,
      initiatingSiteId: (p.metadata as Record<string, unknown>)?.initiating_site_id,
      initiatingSiteName: (p.metadata as Record<string, unknown>)?.initiating_site_name,
      locations: (p.metadata as Record<string, unknown>)?.discovered_locations || [],
    })),
  });
}

export async function POST(req: NextRequest) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (adminCookie !== "authenticated") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { social_account_id, site_id, location_index } = await req.json();

  if (!social_account_id || !site_id || location_index === undefined) {
    return NextResponse.json({ error: "social_account_id, site_id, and location_index required" }, { status: 400 });
  }

  // Get the pending social account
  const [pending] = await sql`
    SELECT id, subscription_id, access_token_encrypted, refresh_token_encrypted,
           token_expires_at, metadata
    FROM social_accounts
    WHERE id = ${social_account_id}
      AND platform = 'gbp'
      AND status = 'pending_assignment'
  `;

  if (!pending) {
    return NextResponse.json({ error: "Pending connection not found" }, { status: 404 });
  }

  const metadata = pending.metadata as Record<string, unknown>;
  const locations = (metadata.discovered_locations || []) as Array<{
    accountId: string;
    locationId: string;
    locationName: string;
    address: string;
  }>;

  const selectedLocation = locations[location_index];
  if (!selectedLocation) {
    return NextResponse.json({ error: "Invalid location index" }, { status: 400 });
  }

  // Create the real social_account for this specific location
  const [newAccount] = await sql`
    INSERT INTO social_accounts (
      subscription_id, platform, account_name, account_id,
      access_token_encrypted, refresh_token_encrypted, token_expires_at,
      scopes, status, metadata
    )
    VALUES (
      ${pending.subscription_id}, 'gbp',
      ${selectedLocation.locationName},
      ${selectedLocation.locationId},
      ${pending.access_token_encrypted},
      ${pending.refresh_token_encrypted},
      ${pending.token_expires_at},
      ${"{business.manage}"},
      'active',
      ${JSON.stringify({
        google_account_id: metadata.google_account_id,
        google_email: metadata.google_email,
        account_id: selectedLocation.accountId,
        location_id: selectedLocation.locationId,
        location_name: selectedLocation.locationName,
        address: selectedLocation.address,
        site_id: site_id,
      })}
    )
    ON CONFLICT (subscription_id, platform, account_id)
    DO UPDATE SET
      account_name = EXCLUDED.account_name,
      access_token_encrypted = EXCLUDED.access_token_encrypted,
      refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
      token_expires_at = EXCLUDED.token_expires_at,
      status = 'active',
      metadata = EXCLUDED.metadata,
      updated_at = NOW()
    RETURNING id
  `;

  // Remove old site_social_link (from the pending account)
  await sql`
    DELETE FROM site_social_links WHERE social_account_id = ${social_account_id}
  `;

  // Link the new account to the correct site
  await sql`
    INSERT INTO site_social_links (site_id, social_account_id)
    VALUES (${site_id}, ${newAccount.id})
    ON CONFLICT DO NOTHING
  `;

  // Store GBP location record
  await sql`
    INSERT INTO gbp_locations (
      site_id, external_id, gbp_account_id, gbp_location_id,
      sync_status, sync_data
    )
    VALUES (
      ${site_id}, ${selectedLocation.locationId},
      ${selectedLocation.accountId}, ${selectedLocation.locationId},
      'synced', ${JSON.stringify({ name: selectedLocation.locationName, address: selectedLocation.address })}
    )
    ON CONFLICT DO NOTHING
  `;

  // Delete the pending social account
  await sql`
    DELETE FROM social_accounts WHERE id = ${social_account_id}
  `;

  // Sync GBP profile
  try {
    const { syncProfileFromGoogle } = await import("@/lib/gbp/profile");
    await syncProfileFromGoogle(site_id);
  } catch { /* non-fatal */ }

  return NextResponse.json({
    success: true,
    location: selectedLocation.locationName,
    socialAccountId: newAccount.id,
  });
}
