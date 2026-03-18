import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { getTwitterAuthUrl, generateCodeVerifier } from "@/lib/twitter";

/**
 * GET /api/auth/twitter
 *
 * Initiates the X/Twitter OAuth 2.0 + PKCE flow. Returns a redirect URL.
 * The code_verifier is encoded in state for retrieval during callback.
 */
export async function GET(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  const codeVerifier = generateCodeVerifier();

  const state = Buffer.from(
    JSON.stringify({
      subscriber_id: auth.subscriberId,
      code_verifier: codeVerifier,
    })
  ).toString("base64url");

  const authUrl = getTwitterAuthUrl(state, codeVerifier);

  return NextResponse.json({ auth_url: authUrl });
}
