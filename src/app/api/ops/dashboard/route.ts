import { isAdminRequest } from "@/lib/admin-session";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

/**
 * GET /api/ops/dashboard
 * Returns platform-wide aggregate metrics for the manage overview.
 */
export async function GET(req: NextRequest) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [
    subscriberStats,
    contentStats,
    platformHealth,
    recentArticles,
    attentionSites,
  ] = await Promise.all([
    sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE is_active = true)::int AS active,
        COUNT(*) FILTER (WHERE cancelled_at IS NOT NULL)::int AS cancelled,
        COUNT(*) FILTER (WHERE metadata->>'onboarding_status' = 'new')::int AS onboarding
      FROM accounts
    `,

    sql`
      SELECT
        (SELECT COUNT(*)::int FROM businesses WHERE is_active = true) AS total_sites,
        (SELECT COUNT(*)::int FROM media_assets) AS total_assets,
        (SELECT COUNT(*)::int FROM blog_posts WHERE status = 'published') AS published_articles,
        (SELECT COUNT(*)::int FROM blog_posts WHERE status = 'published' AND published_at >= NOW() - INTERVAL '7 days') AS articles_this_week,
        (SELECT COUNT(*)::int FROM social_posts WHERE status = 'published') AS published_posts,
        (SELECT COUNT(*)::int FROM businesses WHERE autopilot_enabled = true AND is_active = true) AS autopilot_sites
    `,

    sql`
      SELECT
        (SELECT COUNT(*)::int FROM social_accounts WHERE status = 'active') AS active_connections,
        (SELECT COUNT(*)::int FROM social_accounts WHERE status = 'active' AND token_expires_at < NOW() + INTERVAL '3 days') AS expiring_tokens,
        (SELECT COUNT(*)::int FROM social_accounts WHERE platform = 'gbp' AND status = 'pending_assignment') AS pending_gbp,
        (SELECT COUNT(*)::int FROM businesses WHERE provisioning_status = 'requested' AND is_active = true) AS pending_provisioning
    `,

    sql`
      SELECT bp.title, bp.published_at, s.name AS site_name
      FROM blog_posts bp
      JOIN businesses s ON s.id = bp.business_id
      WHERE bp.status = 'published'
      ORDER BY bp.published_at DESC NULLS LAST
      LIMIT 6
    `,

    sql`
      SELECT s.id, s.name, s.provisioning_status, s.autopilot_enabled,
             u.name AS subscriber_name,
             (SELECT COUNT(*)::int FROM media_assets WHERE business_id = s.id) AS assets,
             (SELECT COUNT(*)::int FROM blog_posts WHERE business_id = s.id AND status = 'published') AS published
      FROM businesses s
      JOIN accounts sub ON sub.id = s.billing_account_id
      JOIN users u ON u.id = sub.owner_user_id
      WHERE s.is_active = true
        AND (s.provisioning_status != 'complete' OR s.autopilot_enabled = false)
      ORDER BY s.created_at DESC
      LIMIT 8
    `,
  ]);

  return NextResponse.json({
    subscribers: subscriberStats[0] || {},
    content: contentStats[0] || {},
    health: platformHealth[0] || {},
    recentArticles,
    attentionSites,
  });
}
