import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { getLinkedInAuthUrl } from "@/lib/linkedin";

/**
 * GET /api/auth/linkedin
 *
 * Initiates the LinkedIn OAuth 2.0 flow. Returns a redirect URL.
 */
export async function GET(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  const siteId = new URL(req.url).searchParams.get("site_id");

  const state = Buffer.from(
    JSON.stringify({
      subscriber_id: auth.subscriberId,
      site_id: siteId || null,
      source: new URL(req.url).searchParams.get("source") || null,
    })
  ).toString("base64url");

  const authUrl = getLinkedInAuthUrl(state);

  return NextResponse.json({ auth_url: authUrl });
}
