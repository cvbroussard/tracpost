import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";

/**
 * GET /api/calendar?site_id=xxx
 *
 * Returns all posts for a site (scheduled, published, vetoed, failed).
 * Subscriber-facing — shows their content calendar.
 */
export async function GET(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  const siteId = new URL(req.url).searchParams.get("site_id");
  if (!siteId) {
    return NextResponse.json({ error: "site_id is required" }, { status: 400 });
  }

  // Verify site ownership
  const [site] = await sql`
    SELECT id FROM businesses WHERE id = ${siteId} AND billing_account_id = ${auth.subscriptionId}
  `;
  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  // Two bind models in flight during the migration:
  //   - Legacy: site_social_links (old per-site connection model)
  //   - New: site_platform_assets → platform_assets (decoupled FB/IG/Ads model)
  // Compose writes social_posts via the new model; older autopilot posts
  // were written via legacy. UNION both so On Deck surfaces both, otherwise
  // the new-model posts (e.g. anything from Compose) are invisible to the
  // calendar — the trust-artifact countdown breaks because the post itself
  // doesn't appear in the queue.
  const posts = await sql`
    SELECT sp.id, sp.caption, sp.hashtags, sp.status, sp.scheduled_at,
           sp.published_at, sp.content_pillar, sp.platform_post_url,
           sp.link_url, sp.trigger_type,
           sp.veto_reason, sp.error_message,
           sa.account_name, sa.platform
    FROM social_posts sp
    JOIN social_accounts sa ON sp.account_id = sa.id
    WHERE sa.id IN (
      SELECT ssl.social_account_id
      FROM business_social_links ssl
      WHERE ssl.business_id = ${siteId}
      UNION
      SELECT pa.social_account_id
      FROM business_platform_assets spa
      JOIN platform_assets pa ON pa.id = spa.platform_asset_id
      WHERE spa.business_id = ${siteId}
    )
    ORDER BY COALESCE(sp.scheduled_at, sp.created_at) DESC
    LIMIT 100
  `;

  return NextResponse.json({ posts });
}
