import { sql } from "@/lib/db";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { getTimezoneForCoords } from "@/lib/google-timezone";

/**
 * POST /api/sites — Create a site under the authenticated subscriber.
 */
export async function POST(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  try {
    const body = await req.json();
    const { name, domain, blog_url, url, external_id, brand_voice, business_type,
      location, place_id, place_lat, place_lon, place_name } = body;

    if (!name) {
      return NextResponse.json(
        { error: "name is required" },
        { status: 400 }
      );
    }
    // Canonical place is optional here (Setup keeps location optional), but
    // when present, all 4 must be set together and placeId can't be synthetic.
    if (place_id) {
      if (typeof place_id === "string" && place_id.startsWith("manual_")) {
        return NextResponse.json({ error: "Synthetic placeId cannot be saved as canonical" }, { status: 400 });
      }
      if (typeof place_lat !== "number" || typeof place_lon !== "number") {
        return NextResponse.json({ error: "place_lat and place_lon must be numbers" }, { status: 400 });
      }
    }

    // Resolve timezone from canonical place coords. Returns null when
    // place isn't set OR Google API fails — backfill picks it up later.
    const timezone = place_id
      ? await getTimezoneForCoords(place_lat, place_lon)
      : null;

    const rows = await sql`
      INSERT INTO businesses (
        billing_account_id, name, domain, blog_url, url, external_id, brand_voice, business_type,
        location, place_id, place_lat, place_lon, place_name, place_set_at, timezone
      )
      VALUES (
        ${auth.subscriptionId}, ${name},
        ${domain || null}, ${blog_url || null},
        ${url || (domain ? `https://${domain}` : null)},
        ${external_id || null}, ${JSON.stringify(brand_voice || {})},
        ${business_type || null}, ${location || place_name || null},
        ${place_id || null}, ${place_id ? place_lat : null}, ${place_id ? place_lon : null},
        ${place_id ? (place_name || null) : null}, ${place_id ? new Date() : null},
        ${timezone}
      )
      RETURNING id, billing_account_id, name, domain, blog_url, url, external_id, brand_voice, business_type, location, created_at
    `;

    // Give the account owner a business-admin membership for the new business (v3)
    await sql`
      INSERT INTO memberships (user_id, scope_type, scope_id, role, capability)
      SELECT a.owner_user_id, 'business', ${rows[0].id}, 'admin', 'full'
      FROM accounts a WHERE a.id = ${auth.subscriptionId} AND a.owner_user_id IS NOT NULL
      ON CONFLICT DO NOTHING
    `;

    return NextResponse.json({ site: rows[0] }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/sites — List all sites for the authenticated subscriber.
 */
export async function GET(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  try {
    const rows = await sql`
      SELECT id, name, url, external_id, brand_voice, metadata, created_at, updated_at
      FROM businesses
      WHERE billing_account_id = ${auth.subscriptionId}
      ORDER BY created_at DESC
    `;
    return NextResponse.json({ sites: rows });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
