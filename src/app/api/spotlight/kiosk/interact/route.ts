import { NextRequest, NextResponse } from "next/server";
import { authenticateKiosk } from "@/lib/spotlight/kiosk-auth";
import { sql } from "@/lib/db";
import { publishSpotlight } from "@/lib/spotlight/publish";

/**
 * POST /api/spotlight/kiosk/interact
 *
 * Submit customer rating, review text, consent from kiosk.
 * Body: { kiosk_token, session_id, star_rating, review_text?, customer_name?, customer_email?, photo_consent }
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { kiosk_token, session_id, star_rating, review_text, customer_name, customer_email, photo_consent } = body;

  if (!kiosk_token || !session_id) {
    return NextResponse.json({ error: "kiosk_token and session_id required" }, { status: 400 });
  }

  const kiosk = await authenticateKiosk(kiosk_token);
  if (!kiosk) return NextResponse.json({ error: "Invalid kiosk token" }, { status: 401 });

  // Verify session belongs to this kiosk's site
  const [session] = await sql`
    SELECT id, site_id FROM spotlight_sessions
    WHERE id = ${session_id} AND site_id = ${kiosk.siteId} AND status = 'active'
  `;

  if (!session) return NextResponse.json({ error: "Session not found or expired" }, { status: 404 });

  // Build Google review deep link
  const googlePlaceId = kiosk.settings?.google_place_id as string;
  const googleReviewUrl = googlePlaceId
    ? `https://search.google.com/local/writereview?placeid=${googlePlaceId}`
    : null;

  // Update session with customer data
  await sql`
    UPDATE spotlight_sessions SET
      customer_name = ${customer_name || null},
      customer_email = ${customer_email || null},
      star_rating = ${star_rating || null},
      review_text = ${review_text || null},
      photo_consent = ${photo_consent || false},
      consent_at = ${photo_consent ? new Date().toISOString() : null},
      google_review_url = ${googleReviewUrl},
      status = 'completed',
      completed_at = NOW(),
      updated_at = NOW()
    WHERE id = ${session_id}
  `;

  // Log analytics
  if (star_rating) {
    await sql`
      INSERT INTO spotlight_analytics (session_id, site_id, event, metadata)
      VALUES (${session_id}, ${kiosk.siteId}, 'rating_tapped', ${JSON.stringify({ rating: star_rating })})
    `;
  }

  await sql`
    INSERT INTO spotlight_analytics (session_id, site_id, event)
    VALUES (${session_id}, ${kiosk.siteId}, 'review_submitted')
  `;

  // Trigger social post publishing if consent given (non-blocking)
  if (photo_consent) {
    publishSpotlight(session_id).catch((err) => {
      console.error("Spotlight publish error:", err instanceof Error ? err.message : err);
    });
  }

  return NextResponse.json({
    success: true,
    google_review_url: googleReviewUrl,
  });
}
