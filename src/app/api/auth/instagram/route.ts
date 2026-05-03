import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { getMetaAuthUrl } from "@/lib/meta";
import { sql } from "@/lib/db";

/**
 * GET /api/auth/instagram?page_ids=123,456
 *
 * Initiates the Meta OAuth flow. Returns a redirect URL.
 * Social accounts are owned by the subscriber, not a site.
 * page_ids is optional — comma-separated Facebook Page IDs to use
 * as fallback if me/accounts returns empty (Dev mode quirk).
 */
export async function GET(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  // Guard: a connection has nowhere to publish without at least one site.
  const sites = await sql`SELECT 1 FROM sites WHERE subscription_id = ${auth.subscriptionId} LIMIT 1`;
  if (sites.length === 0) {
    return NextResponse.json({ error: "no_sites" }, { status: 400 });
  }

  const params = new URL(req.url).searchParams;
  const pageIds = params.get("page_ids");
  const siteId = params.get("site_id");

  const state = Buffer.from(
    JSON.stringify({
      subscription_id: auth.subscriptionId,
      site_id: siteId || null,
      source: params.get("source") || null,
      page_ids: pageIds ? pageIds.split(",").map((s) => s.trim()) : [],
    })
  ).toString("base64url");

  const authUrl = getMetaAuthUrl(state);

  return NextResponse.json({ auth_url: authUrl });
}
