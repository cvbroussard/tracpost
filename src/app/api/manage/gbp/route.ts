import { verifyCookie } from "@/lib/cookie-sign";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

/**
 * GET /api/manage/gbp?site_id=xxx
 * Returns GBP status and profile data for a site.
 */
export async function GET(req: NextRequest) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (!verifyCookie(adminCookie)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const siteId = new URL(req.url).searchParams.get("site_id");
  if (!siteId) return NextResponse.json({ error: "site_id required" }, { status: 400 });

  const [site] = await sql`
    SELECT s.gbp_profile, s.gbp_sync_dirty, s.gbp_dirty_fields,
           s.gsc_property, s.gsc_verification_token
    FROM sites s
    WHERE s.id = ${siteId}
  `;

  // GBP connection
  const [gbpAccount] = await sql`
    SELECT sa.id, sa.account_name, sa.status, sa.token_expires_at, sa.metadata
    FROM social_accounts sa
    JOIN site_social_links ssl ON ssl.social_account_id = sa.id
    WHERE ssl.site_id = ${siteId} AND sa.platform = 'gbp'
    ORDER BY sa.created_at DESC
    LIMIT 1
  `;

  // GBP location
  const [gbpLocation] = await sql`
    SELECT external_id, gbp_account_id, gbp_location_id, sync_status, sync_data
    FROM gbp_locations
    WHERE site_id = ${siteId}
    LIMIT 1
  `.catch(() => [null]);

  // Photo sync stats
  const [photoStats] = await sql`
    SELECT
      COUNT(*)::int AS total_synced
    FROM gbp_photo_sync
    WHERE site_id = ${siteId}
  `.catch(() => [{ total_synced: 0 }]);

  // Review stats
  const [reviewStats] = await sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE reply_status = 'pending')::int AS pending_replies
    FROM inbox_reviews
    WHERE site_id = ${siteId}
  `.catch(() => [{ total: 0, pending_replies: 0 }]);

  const profile = (site?.gbp_profile || {}) as Record<string, unknown>;
  const meta = (gbpAccount?.metadata || {}) as Record<string, unknown>;

  return NextResponse.json({
    connected: !!gbpAccount,
    account: gbpAccount ? {
      name: gbpAccount.account_name,
      status: gbpAccount.status,
      tokenExpires: gbpAccount.token_expires_at,
    } : null,
    location: gbpLocation ? {
      locationId: gbpLocation.gbp_location_id,
      syncStatus: gbpLocation.sync_status,
      syncData: gbpLocation.sync_data,
    } : null,
    profile: {
      title: profile.title || meta.location_name || null,
      phone: profile.phoneNumber || null,
      website: profile.websiteUri || null,
      address: profile.address || null,
      categories: profile.categories || null,
      hours: profile.regularHours || null,
      description: profile.description || null,
    },
    sync: {
      dirty: site?.gbp_sync_dirty || false,
      dirtyFields: site?.gbp_dirty_fields || [],
    },
    searchConsole: {
      property: site?.gsc_property || null,
      verified: !!site?.gsc_property,
      tokenSet: !!site?.gsc_verification_token,
    },
    photos: {
      synced: photoStats?.total_synced || 0,
    },
    reviews: {
      total: reviewStats?.total || 0,
      pendingReplies: reviewStats?.pending_replies || 0,
    },
  });
}
