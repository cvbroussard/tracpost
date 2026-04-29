/**
 * GET /api/admin/engage?subscription_id=xxx&site_id=xxx&review_status=new
 * Returns:
 *   - events: recent engagement_events for the subscriber/site
 *   - persons: top engaged persons for the subscriber
 *   - summary: counts by platform, sentiment, status
 */
import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import { sql } from "@/lib/db";

export async function GET(req: NextRequest) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (!isAdminRequest(adminCookie)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const subscriptionId = url.searchParams.get("subscription_id");
  const siteId = url.searchParams.get("site_id");
  const includeArchived = url.searchParams.get("include_archived") === "true";
  const includeSpam = url.searchParams.get("include_spam") === "true";

  if (!subscriptionId) {
    return NextResponse.json({ error: "subscription_id required" }, { status: 400 });
  }

  // Recent events — last 100, optionally filtered by site
  const events = siteId
    ? await sql`
        SELECT ee.id, ee.platform, ee.event_type, ee.body, ee.sentiment,
               ee.permalink, ee.occurred_at, ee.review_status,
               ee.engaged_person_id,
               ee.metadata->>'star_rating' AS star_rating,
               ee.metadata->>'sentiment_rationale' AS sentiment_rationale,
               ee.metadata->'appeal'->>'submittedAt' AS appeal_submitted_at,
               (ee.metadata->>'is_spam')::boolean AS is_spam,
               ep.display_name AS person_display_name,
               eph.handle AS person_handle,
               eph.avatar_url AS person_avatar_url
        FROM engagement_events ee
        LEFT JOIN engaged_persons ep ON ep.id = ee.engaged_person_id
        LEFT JOIN engaged_person_handles eph ON eph.engaged_person_id = ep.id AND eph.platform = ee.platform
        WHERE ee.subscription_id = ${subscriptionId} AND ee.site_id = ${siteId}
          AND (
            -- Spam events: shown only when include_spam=true
            ((ee.metadata->>'is_spam') = 'true' AND ${includeSpam})
            -- Archived non-spam events: shown only when include_archived=true
            OR ((ee.metadata->>'is_spam') IS DISTINCT FROM 'true' AND ee.review_status = 'archived' AND ${includeArchived})
            -- Active non-spam events: always shown
            OR ((ee.metadata->>'is_spam') IS DISTINCT FROM 'true' AND ee.review_status != 'archived')
          )
        ORDER BY ee.occurred_at DESC
        LIMIT 100
      `
    : await sql`
        SELECT ee.id, ee.platform, ee.event_type, ee.body, ee.sentiment,
               ee.permalink, ee.occurred_at, ee.review_status,
               ee.engaged_person_id,
               ee.metadata->>'star_rating' AS star_rating,
               ee.metadata->>'sentiment_rationale' AS sentiment_rationale,
               ee.metadata->'appeal'->>'submittedAt' AS appeal_submitted_at,
               (ee.metadata->>'is_spam')::boolean AS is_spam,
               ep.display_name AS person_display_name,
               eph.handle AS person_handle,
               eph.avatar_url AS person_avatar_url
        FROM engagement_events ee
        LEFT JOIN engaged_persons ep ON ep.id = ee.engaged_person_id
        LEFT JOIN engaged_person_handles eph ON eph.engaged_person_id = ep.id AND eph.platform = ee.platform
        WHERE ee.subscription_id = ${subscriptionId}
          AND (
            -- Spam events: shown only when include_spam=true
            ((ee.metadata->>'is_spam') = 'true' AND ${includeSpam})
            -- Archived non-spam events: shown only when include_archived=true
            OR ((ee.metadata->>'is_spam') IS DISTINCT FROM 'true' AND ee.review_status = 'archived' AND ${includeArchived})
            -- Active non-spam events: always shown
            OR ((ee.metadata->>'is_spam') IS DISTINCT FROM 'true' AND ee.review_status != 'archived')
          )
        ORDER BY ee.occurred_at DESC
        LIMIT 100
      `;

  // Top engagers — most events first, no time filter (historical engagement counts).
  // avatar_url + primary_platform pick the most-recently-seen handle.
  // Persons whose events are ALL spam are hidden unless include_spam=true.
  const topPersons = await sql`
    SELECT ep.id, ep.display_name, ep.engagement_count,
           ep.positive_engagements, ep.negative_engagements,
           ep.is_advocate, ep.is_influencer, ep.last_seen_at,
           (SELECT JSONB_AGG(jsonb_build_object(
              'platform', platform, 'handle', handle,
              'follower_count', follower_count, 'avatar_url', avatar_url))
            FROM engaged_person_handles WHERE engaged_person_id = ep.id) AS handles,
           (SELECT avatar_url FROM engaged_person_handles
            WHERE engaged_person_id = ep.id AND avatar_url IS NOT NULL
            ORDER BY last_seen_at DESC LIMIT 1) AS avatar_url,
           (SELECT platform FROM engaged_person_handles
            WHERE engaged_person_id = ep.id
            ORDER BY last_seen_at DESC LIMIT 1) AS primary_platform
    FROM engaged_persons ep
    WHERE ep.subscription_id = ${subscriptionId}
      AND (
        ${includeSpam}
        OR EXISTS (
          SELECT 1 FROM engagement_events ee
          WHERE ee.engaged_person_id = ep.id
            AND (ee.metadata->>'is_spam') IS DISTINCT FROM 'true'
        )
      )
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
