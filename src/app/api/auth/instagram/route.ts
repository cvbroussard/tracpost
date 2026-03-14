import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { getMetaAuthUrl } from "@/lib/meta";
import { sql } from "@/lib/db";

/**
 * GET /api/auth/instagram?site_id=xxx&page_ids=123,456
 *
 * Initiates the Meta OAuth flow. Returns a redirect URL.
 * page_ids is optional — comma-separated Facebook Page IDs to use
 * as fallback if me/accounts returns empty (Dev mode quirk).
 */
export async function GET(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  const params = new URL(req.url).searchParams;
  const siteId = params.get("site_id");
  const pageIds = params.get("page_ids");

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

  // Encode state: site_id + subscriber_id + optional page_ids
  const state = Buffer.from(
    JSON.stringify({
      site_id: siteId,
      subscriber_id: auth.subscriberId,
      page_ids: pageIds ? pageIds.split(",").map((s) => s.trim()) : [],
    })
  ).toString("base64url");

  const authUrl = getMetaAuthUrl(state);

  return NextResponse.json({ auth_url: authUrl });
}
