import { NextRequest, NextResponse } from "next/server";
import { authenticateKiosk } from "@/lib/spotlight/kiosk-auth";
import { sql } from "@/lib/db";

/**
 * POST /api/spotlight/kiosk/google-click
 *
 * Record that the customer clicked the Google review deep link.
 * Body: { kiosk_token, session_id }
 */
export async function POST(req: NextRequest) {
  const { kiosk_token, session_id } = await req.json();

  if (!kiosk_token || !session_id) {
    return NextResponse.json({ error: "kiosk_token and session_id required" }, { status: 400 });
  }

  const kiosk = await authenticateKiosk(kiosk_token);
  if (!kiosk) return NextResponse.json({ error: "Invalid kiosk token" }, { status: 401 });

  await sql`
    UPDATE spotlight_sessions
    SET google_review_opened = true, updated_at = NOW()
    WHERE id = ${session_id} AND business_id = ${kiosk.siteId}
  `;

  await sql`
    INSERT INTO spotlight_analytics (session_id, business_id, event)
    VALUES (${session_id}, ${kiosk.siteId}, 'google_link_opened')
  `;

  return NextResponse.json({ success: true });
}
