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
  const page = Math.max(1, parseInt(params.get("page") || "1", 10));
  const limit = 20;
  const offset = (page - 1) * limit;

  const reviews = await sql`
    SELECT *
    FROM inbox_reviews
    WHERE site_id = ${siteId}
      AND subscriber_id = ${auth.subscriberId}
      AND is_hidden = false
      ${unreadOnly ? sql`AND is_read = false` : sql``}
    ORDER BY reviewed_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  return NextResponse.json({ reviews, page, limit });
}
