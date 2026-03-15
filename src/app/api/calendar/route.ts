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
    SELECT id FROM sites WHERE id = ${siteId} AND subscriber_id = ${auth.subscriberId}
  `;
  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  const posts = await sql`
    SELECT sp.id, sp.caption, sp.hashtags, sp.status, sp.scheduled_at,
           sp.published_at, sp.content_pillar, sp.platform_post_url,
           sp.veto_reason, sp.error_message,
           sa.account_name, sa.platform
    FROM social_posts sp
    JOIN social_accounts sa ON sp.account_id = sa.id
    WHERE sa.site_id = ${siteId}
    ORDER BY COALESCE(sp.scheduled_at, sp.created_at) DESC
    LIMIT 100
  `;

  return NextResponse.json({ posts });
}
