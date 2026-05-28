import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";

/**
 * GET /api/inbox/reviews?site_id=xxx&unread_only=true&page=1
 *
 * Returns reviews for a site, sorted by most recent.
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
  const replyStatus = params.get("reply_status");
  const minRating = params.get("min_rating");
  const maxRating = params.get("max_rating");
  const platform = params.get("platform");
  const page = Math.max(1, parseInt(params.get("page") || "1", 10));
  const limit = 20;
  const offset = (page - 1) * limit;

  const reviews = await sql`
    SELECT *
    FROM inbox_reviews
    WHERE business_id = ${siteId}
      AND billing_account_id = ${auth.subscriptionId}
      AND is_hidden = false
      ${unreadOnly ? sql`AND is_read = false` : sql``}
      ${replyStatus ? sql`AND reply_status = ${replyStatus}` : sql``}
      ${minRating ? sql`AND rating >= ${parseInt(minRating, 10)}` : sql``}
      ${maxRating ? sql`AND rating <= ${parseInt(maxRating, 10)}` : sql``}
      ${platform ? sql`AND platform = ${platform}` : sql``}
    ORDER BY reviewed_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  // Counts for filter badges
  const [counts] = await sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE reply_status = 'needs_reply')::int AS needs_reply,
      COUNT(*) FILTER (WHERE reply_status = 'draft_ready')::int AS draft_ready,
      COUNT(*) FILTER (WHERE reply_status = 'replied')::int AS replied
    FROM inbox_reviews
    WHERE business_id = ${siteId}
      AND billing_account_id = ${auth.subscriptionId}
      AND is_hidden = false
  `;

  return NextResponse.json({ reviews, counts, page, limit });
}
