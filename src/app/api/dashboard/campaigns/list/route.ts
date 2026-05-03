import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { listCampaigns, getCampaignInsights } from "@/lib/meta-ads";
import { resolveAdAccount } from "@/lib/meta-ads-resolve";

/**
 * GET /api/dashboard/campaigns/list?adAccountId=xxx
 *
 * Calls Marketing API: lists all campaigns under the chosen ad account
 * (or the primary assigned to the active Business if no adAccountId is
 * provided), with lifetime insights per campaign.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!session.activeSiteId) {
    return NextResponse.json({ error: "No active site" }, { status: 400 });
  }

  const platformAssetId = new URL(req.url).searchParams.get("adAccountId");
  const resolved = await resolveAdAccount({
    subscriptionId: session.subscriptionId,
    activeSiteId: session.activeSiteId,
    platformAssetId,
  });

  if (!resolved) {
    return NextResponse.json({ campaigns: [] });
  }

  const { adAccountId, accessToken } = resolved;

  try {
    const campaigns = await listCampaigns(adAccountId, accessToken);
    // Fetch insights in parallel; tolerate per-campaign failures
    const enriched = await Promise.all(
      campaigns.map(async (c) => {
        try {
          const insights = await getCampaignInsights(c.id, accessToken);
          return { ...c, insights };
        } catch {
          return {
            ...c,
            insights: {
              spend: "0", impressions: "0", clicks: "0",
              reach: "0", cpc: "0", cpm: "0", ctr: "0",
            },
          };
        }
      })
    );
    return NextResponse.json({ campaigns: enriched });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "marketing_api_failed", message }, { status: 502 });
  }
}
