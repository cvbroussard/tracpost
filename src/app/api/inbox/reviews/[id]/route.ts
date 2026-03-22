import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";

/**
 * PATCH /api/inbox/reviews/[id]
 *
 * Update a review: mark as read, hide.
 */
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
    await sql`UPDATE inbox_reviews SET is_read = ${body.is_read} WHERE id = ${id} AND subscriber_id = ${auth.subscriberId}`;
    updates.push("is_read");
  }

  if (body.is_hidden !== undefined) {
    await sql`UPDATE inbox_reviews SET is_hidden = ${body.is_hidden} WHERE id = ${id} AND subscriber_id = ${auth.subscriberId}`;
    updates.push("is_hidden");
  }

  return NextResponse.json({ updated: updates });
}
