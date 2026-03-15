import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { getMetaAuthUrl } from "@/lib/meta";

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

  const params = new URL(req.url).searchParams;
  const pageIds = params.get("page_ids");

  // Encode state: subscriber_id + optional page_ids
  const state = Buffer.from(
    JSON.stringify({
      subscriber_id: auth.subscriberId,
      page_ids: pageIds ? pageIds.split(",").map((s) => s.trim()) : [],
    })
  ).toString("base64url");

  const authUrl = getMetaAuthUrl(state);

  return NextResponse.json({ auth_url: authUrl });
}
