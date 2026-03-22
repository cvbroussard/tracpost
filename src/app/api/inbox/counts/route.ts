import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";

/**
 * GET /api/inbox/counts?site_id=xxx
 *
 * Returns unread counts per inbox tab.
 */
export async function GET(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  const siteId = new URL(req.url).searchParams.get("site_id");
  if (!siteId) {
    return NextResponse.json({ error: "site_id required" }, { status: 400 });
  }

  const [[comments], [reviews], [messages]] = await Promise.all([
    sql`SELECT COUNT(*)::int AS count FROM inbox_comments WHERE site_id = ${siteId} AND subscriber_id = ${auth.subscriberId} AND is_read = false AND is_hidden = false`,
    sql`SELECT COUNT(*)::int AS count FROM inbox_reviews WHERE site_id = ${siteId} AND subscriber_id = ${auth.subscriberId} AND is_read = false AND is_hidden = false`,
    sql`SELECT COUNT(*)::int AS count FROM inbox_messages WHERE site_id = ${siteId} AND subscriber_id = ${auth.subscriberId} AND is_read = false`,
  ]);

  return NextResponse.json({
    comments: comments.count,
    reviews: reviews.count,
    messages: messages.count,
  });
}
