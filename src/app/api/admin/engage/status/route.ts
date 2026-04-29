/**
 * POST /api/admin/engage/status
 * Body: { eventId, status: 'new' | 'reviewed' | 'archived' }
 */
import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import { sql } from "@/lib/db";

const ALLOWED = new Set(["new", "reviewed", "archived"]);

export async function POST(req: NextRequest) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (!isAdminRequest(adminCookie)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const eventId = body.eventId as string | undefined;
  const status = body.status as string | undefined;

  if (!eventId || !status || !ALLOWED.has(status)) {
    return NextResponse.json({ error: "eventId and valid status required" }, { status: 400 });
  }

  const updated = await sql`
    UPDATE engagement_events
    SET review_status = ${status}
    WHERE id = ${eventId}
    RETURNING id, review_status
  `;

  if (updated.length === 0) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  return NextResponse.json({ event: updated[0] });
}
