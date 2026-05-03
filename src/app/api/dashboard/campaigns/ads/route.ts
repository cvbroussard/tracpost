import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { listAds } from "@/lib/meta-ads";
import { resolveAdAccount } from "@/lib/meta-ads-resolve";

/**
 * GET /api/dashboard/campaigns/ads?campaignId=xxx&adAccountId=yyy
 *
 * Returns the ads under a campaign with creative info + per-ad
 * insights — drives the campaign drill-down on the Campaigns tab.
 *
 * If no campaignId provided, returns all ads in the chosen ad account
 * (used by the already-promoted badge logic on the Promote a Post tab).
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!session.activeSiteId) return NextResponse.json({ error: "No active site" }, { status: 400 });
  if (!session.plan.toLowerCase().includes("enterprise")) {
    return NextResponse.json({ error: "Enterprise tier required" }, { status: 403 });
  }

  const params = new URL(req.url).searchParams;
  const campaignId = params.get("campaignId") || undefined;
  const platformAssetId = params.get("adAccountId");

  const resolved = await resolveAdAccount({
    subscriptionId: session.subscriptionId,
    activeSiteId: session.activeSiteId,
    platformAssetId,
  });
  if (!resolved) return NextResponse.json({ ads: [] });

  const { adAccountId, accessToken } = resolved;

  try {
    const ads = await listAds(adAccountId, accessToken, campaignId);
    return NextResponse.json({ ads });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "marketing_api_failed", message }, { status: 502 });
  }
}
