import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";

/**
 * GET /api/spotlight/analytics?site_id=xxx
 *
 * Aggregated Spotlight funnel data.
 */
export async function GET(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  const siteId = new URL(req.url).searchParams.get("site_id");
  if (!siteId) return NextResponse.json({ error: "site_id required" }, { status: 400 });

  const [[totals], funnel, ratingDist, recentSessions] = await Promise.all([
    // Overall totals
    sql`
      SELECT
        COUNT(*)::int AS total_sessions,
        COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
        COUNT(*) FILTER (WHERE google_review_opened = true)::int AS reviews_opened,
        COUNT(*) FILTER (WHERE photo_consent = true)::int AS consented,
        AVG(star_rating) FILTER (WHERE star_rating IS NOT NULL) AS avg_rating
      FROM spotlight_sessions
      WHERE business_id = ${siteId} AND billing_account_id = ${auth.subscriptionId}
    `,
    // Funnel events
    sql`
      SELECT event, COUNT(*)::int AS count
      FROM spotlight_analytics
      WHERE business_id = ${siteId}
      GROUP BY event
      ORDER BY count DESC
    `,
    // Rating distribution
    sql`
      SELECT star_rating, COUNT(*)::int AS count
      FROM spotlight_sessions
      WHERE business_id = ${siteId} AND billing_account_id = ${auth.subscriptionId} AND star_rating IS NOT NULL
      GROUP BY star_rating
      ORDER BY star_rating DESC
    `,
    // Recent sessions
    sql`
      SELECT id, session_code, status, customer_name, star_rating,
             google_review_opened, photo_consent, captured_at, completed_at
      FROM spotlight_sessions
      WHERE business_id = ${siteId} AND billing_account_id = ${auth.subscriptionId}
      ORDER BY created_at DESC
      LIMIT 10
    `,
  ]);

  const conversionRate = totals.total_sessions > 0
    ? ((totals.reviews_opened / totals.total_sessions) * 100).toFixed(1)
    : "0.0";

  return NextResponse.json({
    totals: { ...totals, conversion_rate: parseFloat(conversionRate) },
    funnel,
    ratingDistribution: ratingDist,
    recentSessions,
  });
}
