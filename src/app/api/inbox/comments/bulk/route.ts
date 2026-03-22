import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";

/**
 * PATCH /api/inbox/comments/bulk
 *
 * Bulk update comments: mark as read or hide.
 * Body: { ids: string[], is_read?: boolean, is_hidden?: boolean }
 */
export async function PATCH(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  const body = await req.json();
  const { ids } = body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "ids array required" }, { status: 400 });
  }

  let updated = 0;

  if (body.is_read !== undefined) {
    const result = await sql`
      UPDATE inbox_comments SET is_read = ${body.is_read}
      WHERE id = ANY(${ids}) AND subscriber_id = ${auth.subscriberId}
    `;
    updated = Array.isArray(result) ? result.length : 0;
  }

  if (body.is_hidden !== undefined) {
    const result = await sql`
      UPDATE inbox_comments SET is_hidden = ${body.is_hidden}
      WHERE id = ANY(${ids}) AND subscriber_id = ${auth.subscriberId}
    `;
    updated = Array.isArray(result) ? result.length : 0;
  }

  return NextResponse.json({ updated });
}
