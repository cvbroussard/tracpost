import { isAdminRequest } from "@/lib/admin-session";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

/**
 * GET /api/ops/gbp?site_id=xxx
 * Returns GBP status and profile data for a site.
 */
export async function GET(req: NextRequest) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const siteId = new URL(req.url).searchParams.get("site_id");
  if (!siteId) return NextResponse.json({ error: "site_id required" }, { status: 400 });

  // 2026-06-13: connection / account / location / searchConsole branches
  // retired alongside the operator-side Connection Health card. Page is
  // pure observation of profile + sync drift; those fields had no consumer.
  const [site] = await sql`
    SELECT s.gbp_profile, s.gbp_sync_dirty, s.gbp_dirty_fields
    FROM businesses s
    WHERE s.id = ${siteId}
  `;

  // Photo sync stats
  const [photoStats] = await sql`
    SELECT
      COUNT(*)::int AS total_synced
    FROM gbp_photo_sync
    WHERE business_id = ${siteId}
  `.catch(() => [{ total_synced: 0 }]);

  // Review stats
  const [reviewStats] = await sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE reply_status = 'pending')::int AS pending_replies
    FROM inbox_reviews
    WHERE business_id = ${siteId}
  `.catch(() => [{ total: 0, pending_replies: 0 }]);

  const profile = (site?.gbp_profile || {}) as Record<string, unknown>;

  return NextResponse.json({
    profile: {
      title: profile.title || null,
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
    photos: {
      synced: photoStats?.total_synced || 0,
    },
    reviews: {
      total: reviewStats?.total || 0,
      pendingReplies: reviewStats?.pending_replies || 0,
    },
  });
}
