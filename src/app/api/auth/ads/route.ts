import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { getMetaAdsAuthUrl } from "@/lib/meta-ads";
import { sql } from "@/lib/db";

/**
 * GET /api/auth/ads
 *
 * Initiates the TracPost — Ads OAuth flow (separate from organic Meta).
 * Marketing API scopes only. Returns an auth_url for the client to
 * redirect to.
 *
 * Just-in-time auth pattern: subscribers only see this when they enter
 * the advertising module. The state parameter carries the destination
 * so they land back at the campaign builder after auth completes.
 */
export async function GET(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  // Guard: an ad-account connection has nowhere to attach without a site.
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
      source: params.get("source") || "campaigns",
    })
  ).toString("base64url");

  const authUrl = getMetaAdsAuthUrl(state);
  return NextResponse.json({ auth_url: authUrl });
}
