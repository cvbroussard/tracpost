import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { getInstagramAuthUrl } from "@/lib/meta-ig";
import { sql } from "@/lib/db";

/**
 * GET /api/auth/visual-ig
 *
 * Initiates the TracPost — Visual-IG OAuth flow via the Instagram
 * Login API (instagram.com OAuth, NOT facebook.com). The IG account
 * does not need to be Page-linked at Meta for organic publishing.
 */
export async function GET(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  // Guard: an IG connection has nowhere to attach without a Business
  const sites = await sql`SELECT 1 FROM sites WHERE subscription_id = ${auth.subscriptionId} LIMIT 1`;
  if (sites.length === 0) {
    return NextResponse.json({ error: "no_sites" }, { status: 400 });
  }

  const params = new URL(req.url).searchParams;
  const siteId = params.get("site_id");

  const state = Buffer.from(
    JSON.stringify({
      subscription_id: auth.subscriptionId,
      site_id: siteId || null,
      source: params.get("source") || null,
      onboarding_token: params.get("onboarding_token") || undefined,
    })
  ).toString("base64url");

  const authUrl = getInstagramAuthUrl(state);
  return NextResponse.json({ auth_url: authUrl });
}
