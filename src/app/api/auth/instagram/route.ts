import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { getMetaAuthUrl } from "@/lib/meta";
import { sql } from "@/lib/db";

/**
 * GET /api/auth/instagram?site_id=xxx
 *
 * Initiates the Meta OAuth flow. Returns a redirect URL that the
 * subscriber opens in their browser. The state param encodes the
 * site_id so the callback knows where to store the credentials.
 */
export async function GET(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  const siteId = new URL(req.url).searchParams.get("site_id");
  if (!siteId) {
    return NextResponse.json({ error: "site_id is required" }, { status: 400 });
  }

  // Verify site belongs to subscriber
  const [site] = await sql`
    SELECT id FROM sites
    WHERE id = ${siteId} AND subscriber_id = ${auth.subscriberId}
  `;
  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  // Encode state: site_id + subscriber_id for callback verification
  const state = Buffer.from(
    JSON.stringify({ site_id: siteId, subscriber_id: auth.subscriberId })
  ).toString("base64url");

  const authUrl = getMetaAuthUrl(state);

  return NextResponse.json({ auth_url: authUrl });
}
