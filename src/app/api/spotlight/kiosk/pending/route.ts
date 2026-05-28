import { NextRequest, NextResponse } from "next/server";
import { authenticateKiosk } from "@/lib/spotlight/kiosk-auth";
import { sql } from "@/lib/db";

/**
 * GET /api/spotlight/kiosk/pending?kiosk_token=xxx
 *
 * Polling endpoint for kiosk. Returns the newest waiting session for the site.
 */
export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("kiosk_token");
  if (!token) return NextResponse.json({ error: "kiosk_token required" }, { status: 400 });

  const kiosk = await authenticateKiosk(token);
  if (!kiosk) return NextResponse.json({ error: "Invalid kiosk token" }, { status: 401 });

  const [session] = await sql`
    SELECT id, session_code, photo_url, staff_note, created_at
    FROM spotlight_sessions
    WHERE business_id = ${kiosk.siteId}
      AND status = 'waiting'
      AND expires_at > NOW()
    ORDER BY created_at DESC
    LIMIT 1
  `;

  if (!session) {
    return NextResponse.json({ session: null });
  }

  // Transition to active
  await sql`
    UPDATE spotlight_sessions
    SET status = 'active', customer_started_at = NOW(), updated_at = NOW()
    WHERE id = ${session.id} AND status = 'waiting'
  `;

  // Log analytics
  await sql`
    INSERT INTO spotlight_analytics (session_id, business_id, event)
    VALUES (${session.id}, ${kiosk.siteId}, 'kiosk_viewed')
  `;

  return NextResponse.json({ session });
}
