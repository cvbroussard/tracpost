import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { getTikTokAuthUrl } from "@/lib/tiktok";

/**
 * GET /api/auth/tiktok
 *
 * Initiates the TikTok OAuth flow. Returns a redirect URL.
 */
export async function GET(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  const state = Buffer.from(
    JSON.stringify({
      subscriber_id: auth.subscriberId,
    })
  ).toString("base64url");

  const authUrl = getTikTokAuthUrl(state);

  return NextResponse.json({ auth_url: authUrl });
}
