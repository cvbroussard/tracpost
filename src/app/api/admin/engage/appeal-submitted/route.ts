/**
 * POST /api/admin/engage/appeal-submitted
 * Body: { eventId, category, draft }
 * Records that the subscriber sent an appeal to Google. Stored on the
 * event's metadata.appeal so we can track outcome on subsequent captures
 * (review disappears = appeal succeeded).
 */
import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import { sql } from "@/lib/db";

export async function POST(req: NextRequest) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (!isAdminRequest(adminCookie)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { eventId, category, draft } = await req.json().catch(() => ({}));
  if (!eventId) {
    return NextResponse.json({ error: "eventId required" }, { status: 400 });
  }

  const appealRecord = {
    appeal: {
      submittedAt: new Date().toISOString(),
      category: category || null,
      draft: draft || null,
    },
  };

  await sql`
    UPDATE engagement_events
    SET metadata = metadata || ${JSON.stringify(appealRecord)}::jsonb
    WHERE id = ${eventId}
  `;

  return NextResponse.json({ success: true });
}
