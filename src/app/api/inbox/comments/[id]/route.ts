import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";

/**
 * GET /api/inbox/comments/[id]
 *
 * If id is a UUID, returns a single comment.
 * If id is a platform_post_id, returns all comments for that post.
 *
 * PATCH /api/inbox/comments/[id]
 *
 * Update a comment: mark as read, hide/archive.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;
  const { id } = await params;

  const siteId = new URL(req.url).searchParams.get("site_id");

  // Treat as platform_post_id and return thread
  const comments = await sql`
    SELECT ic.*, sp.caption AS post_caption, sp.media_urls AS post_media_urls, sp.platform_post_url
    FROM inbox_comments ic
    LEFT JOIN social_posts sp ON sp.platform_post_id = ic.platform_post_id     WHERE ic.subscriber_id = ${auth.subscriberId}
      AND (ic.platform_post_id = ${id} OR ic.post_id::text = ${id})
      ${siteId ? sql`AND ic.site_id = ${siteId}` : sql``}
      AND ic.is_hidden = false
    ORDER BY ic.commented_at ASC
  `;

  // Mark them as read
  if (comments.length > 0) {
    await sql`
      UPDATE inbox_comments SET is_read = true
      WHERE subscriber_id = ${auth.subscriberId}
        AND platform_post_id = ${comments[0].platform_post_id}
        AND is_read = false
    `;
  }

  return NextResponse.json({ comments });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;
  const { id } = await params;

  const body = await req.json();
  const updates: string[] = [];

  if (body.is_read !== undefined) {
    await sql`UPDATE inbox_comments SET is_read = ${body.is_read} WHERE id = ${id} AND subscriber_id = ${auth.subscriberId}`;
    updates.push("is_read");
  }

  if (body.is_hidden !== undefined) {
    await sql`UPDATE inbox_comments SET is_hidden = ${body.is_hidden} WHERE id = ${id} AND subscriber_id = ${auth.subscriberId}`;
    updates.push("is_hidden");
  }

  return NextResponse.json({ updated: updates });
}
