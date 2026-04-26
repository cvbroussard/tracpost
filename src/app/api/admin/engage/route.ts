/**
 * GET /api/admin/engage?subscription_id=xxx&site_id=xxx&review_status=new
 * Returns:
 *   - events: recent engagement_events for the subscriber/site
 *   - persons: top engaged persons for the subscriber
 *   - summary: counts by platform, sentiment, status
 */
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function GET(req: NextRequest) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (adminCookie !== "authenticated") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const subscriptionId = url.searchParams.get("subscription_id");
  const siteId = url.searchParams.get("site_id");

  if (!subscriptionId) {
    return NextResponse.json({ error: "subscription_id required" }, { status: 400 });
  }

  // Recent events — last 100, optionally filtered by site
  const events = siteId
    ? await sql`
        SELECT ee.id, ee.platform, ee.event_type, ee.body, ee.sentiment,
               ee.permalink, ee.occurred_at, ee.review_status,
               ee.engaged_person_id,
               ep.display_name AS person_display_name,
               eph.handle AS person_handle,
               eph.avatar_url AS person_avatar_url
        FROM engagement_events ee
        LEFT JOIN engaged_persons ep ON ep.id = ee.engaged_person_id
        LEFT JOIN engaged_person_handles eph ON eph.engaged_person_id = ep.id AND eph.platform = ee.platform
        WHERE ee.subscription_id = ${subscriptionId} AND ee.site_id = ${siteId}
          AND ee.review_status != 'archived'
        ORDER BY ee.occurred_at DESC
        LIMIT 100
      `
    : await sql`
        SELECT ee.id, ee.platform, ee.event_type, ee.body, ee.sentiment,
               ee.permalink, ee.occurred_at, ee.review_status,
               ee.engaged_person_id,
               ep.display_name AS person_display_name,
               eph.handle AS person_handle,
               eph.avatar_url AS person_avatar_url
        FROM engagement_events ee
        LEFT JOIN engaged_persons ep ON ep.id = ee.engaged_person_id
        LEFT JOIN engaged_person_handles eph ON eph.engaged_person_id = ep.id AND eph.platform = ee.platform
        WHERE ee.subscription_id = ${subscriptionId}
          AND ee.review_status != 'archived'
        ORDER BY ee.occurred_at DESC
        LIMIT 100
      `;

  // Top engagers — most events first, no time filter (historical engagement counts)
  const topPersons = await sql`
    SELECT ep.id, ep.display_name, ep.engagement_count,
           ep.positive_engagements, ep.negative_engagements,
           ep.is_advocate, ep.is_influencer, ep.last_seen_at,
           (SELECT JSONB_AGG(jsonb_build_object('platform', platform, 'handle', handle, 'follower_count', follower_count))
            FROM engaged_person_handles WHERE engaged_person_id = ep.id) AS handles
    FROM engaged_persons ep
    WHERE ep.subscription_id = ${subscriptionId}
    ORDER BY ep.engagement_count DESC, ep.last_seen_at DESC
    LIMIT 50
  `;

  // Summary counts
  const [summary] = await sql`
    SELECT
      COUNT(*)::int AS total_events,
      COUNT(*) FILTER (WHERE review_status = 'new')::int AS unreviewed,
      COUNT(*) FILTER (WHERE sentiment = 'positive')::int AS positive,
      COUNT(*) FILTER (WHERE sentiment = 'negative')::int AS negative,
      COUNT(*) FILTER (WHERE sentiment = 'neutral')::int AS neutral
    FROM engagement_events
    WHERE subscription_id = ${subscriptionId}
      AND occurred_at > NOW() - INTERVAL '30 days'
  `;

  const byPlatform = await sql`
    SELECT platform, COUNT(*)::int AS count
    FROM engagement_events
    WHERE subscription_id = ${subscriptionId}
      AND occurred_at > NOW() - INTERVAL '30 days'
    GROUP BY platform
    ORDER BY count DESC
  `;

  return NextResponse.json({
    events,
    persons: topPersons,
    summary: { ...summary, byPlatform },
  });
}
