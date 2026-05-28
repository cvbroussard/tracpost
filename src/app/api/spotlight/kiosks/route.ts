import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";
import { generateKioskToken } from "@/lib/spotlight/kiosk-auth";

/**
 * POST /api/spotlight/kiosks — Register a new kiosk device
 * GET /api/spotlight/kiosks — List kiosks for a site
 */
export async function POST(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  const { site_id, name, settings } = await req.json();
  if (!site_id || !name) {
    return NextResponse.json({ error: "site_id and name required" }, { status: 400 });
  }

  // Verify site ownership
  const [site] = await sql`SELECT id FROM businesses WHERE id = ${site_id} AND billing_account_id = ${auth.subscriptionId}`;
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  const kioskToken = generateKioskToken();

  const [kiosk] = await sql`
    INSERT INTO spotlight_kiosks (business_id, name, kiosk_token, settings)
    VALUES (${site_id}, ${name}, ${kioskToken}, ${JSON.stringify(settings || {})})
    RETURNING id, name, kiosk_token, created_at
  `;

  const kioskUrl = `${process.env.NEXT_PUBLIC_APP_URL}/spotlight/kiosk/${kioskToken}`;

  return NextResponse.json({ kiosk: { ...kiosk, url: kioskUrl } }, { status: 201 });
}

export async function GET(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  const siteId = new URL(req.url).searchParams.get("site_id");
  if (!siteId) return NextResponse.json({ error: "site_id required" }, { status: 400 });

  const kiosks = await sql`
    SELECT id, name, is_active, settings, last_seen_at, created_at
    FROM spotlight_kiosks
    WHERE business_id = ${siteId}
      AND business_id IN (SELECT id FROM businesses WHERE billing_account_id = ${auth.subscriptionId})
    ORDER BY created_at DESC
  `;

  return NextResponse.json({ kiosks });
}
