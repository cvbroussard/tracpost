import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { getGoogleAuthUrl } from "@/lib/google";

/**
 * GET /api/auth/google?site_id=xxx
 *
 * Initiates the Google OAuth flow for GBP. Returns a redirect URL.
 */
export async function GET(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  const params = new URL(req.url).searchParams;
  const siteId = params.get("site_id");

  if (!siteId) {
    return NextResponse.json({ error: "site_id required" }, { status: 400 });
  }

  const state = Buffer.from(
    JSON.stringify({
      subscriber_id: auth.subscriberId,
      site_id: siteId,
    })
  ).toString("base64url");

  const authUrl = getGoogleAuthUrl(state);

  return NextResponse.json({ auth_url: authUrl });
}
