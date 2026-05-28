import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";
import { generateSessionCode } from "@/lib/spotlight/kiosk-auth";

/**
 * POST /api/spotlight/sessions — Create a new Spotlight session (staff capture)
 * GET /api/spotlight/sessions — List sessions for a site
 */
export async function POST(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  const { site_id, photo_url, photo_key, staff_note } = await req.json();
  if (!site_id) {
    return NextResponse.json({ error: "site_id required" }, { status: 400 });
  }

  // Verify site ownership
  const [site] = await sql`SELECT id FROM businesses WHERE id = ${site_id} AND billing_account_id = ${auth.subscriptionId}`;
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  const sessionCode = generateSessionCode();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 min

  const [session] = await sql`
    INSERT INTO spotlight_sessions (
      business_id, billing_account_id, session_code, photo_url, photo_key,
      staff_note, expires_at, captured_at
    )
    VALUES (
      ${site_id}, ${auth.subscriptionId}, ${sessionCode},
      ${photo_url || null}, ${photo_key || null},
      ${staff_note || null}, ${expiresAt}, ${photo_url ? new Date().toISOString() : null}
    )
    RETURNING id, session_code, status, expires_at, created_at
  `;

  // Log analytics event
  await sql`
    INSERT INTO spotlight_analytics (session_id, business_id, event, metadata)
    VALUES (${session.id}, ${site_id}, 'session_created', ${JSON.stringify({ staff_note: staff_note || null })})
  `;

  if (photo_url) {
    await sql`
      INSERT INTO spotlight_analytics (session_id, business_id, event)
      VALUES (${session.id}, ${site_id}, 'photo_uploaded')
    `;
  }

  return NextResponse.json({ session }, { status: 201 });
}

export async function GET(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  const params = new URL(req.url).searchParams;
  const siteId = params.get("site_id");
  if (!siteId) return NextResponse.json({ error: "site_id required" }, { status: 400 });

  const page = Math.max(1, parseInt(params.get("page") || "1", 10));
  const limit = 20;
  const offset = (page - 1) * limit;

  const sessions = await sql`
    SELECT id, session_code, status, photo_url, staff_note,
           customer_name, star_rating, review_text,
           google_review_opened, photo_consent,
           captured_at, completed_at, created_at
    FROM spotlight_sessions
    WHERE business_id = ${siteId} AND billing_account_id = ${auth.subscriptionId}
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  return NextResponse.json({ sessions, page, limit });
}
