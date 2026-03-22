import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";

/**
 * GET /api/inbox/comments?site_id=xxx&unread_only=true&page=1
 *
 * Returns comments grouped by post, sorted by latest activity.
 */
export async function GET(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  const params = new URL(req.url).searchParams;
  const siteId = params.get("site_id");
  if (!siteId) {
    return NextResponse.json({ error: "site_id required" }, { status: 400 });
  }

  const unreadOnly = params.get("unread_only") === "true";
  const page = Math.max(1, parseInt(params.get("page") || "1", 10));
  const limit = 20;
  const offset = (page - 1) * limit;

  // Get post groups with aggregated comment data
  const postGroups = await sql`
    SELECT
      ic.platform_post_id,
      ic.platform,
      sp.id AS post_id,
      sp.caption,
      sp.media_urls,
      sp.platform_post_url,
      COUNT(*)::int AS comment_count,
      COUNT(*) FILTER (WHERE ic.is_read = false)::int AS unread_count,
      MAX(ic.commented_at) AS latest_activity
    FROM inbox_comments ic
    LEFT JOIN social_posts sp ON sp.platform_post_id = ic.platform_post_id AND sp.platform = ic.platform
    WHERE ic.site_id = ${siteId}
      AND ic.subscriber_id = ${auth.subscriberId}
      AND ic.is_hidden = false
      ${unreadOnly ? sql`AND ic.is_read = false` : sql``}
    GROUP BY ic.platform_post_id, ic.platform, sp.id, sp.caption, sp.media_urls, sp.platform_post_url
    ORDER BY latest_activity DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  return NextResponse.json({ postGroups, page, limit });
}
