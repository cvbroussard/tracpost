import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { createCampaign, createAdSet } from "@/lib/meta-ads";
import { resolveAdAccount } from "@/lib/meta-ads-resolve";

/**
 * POST /api/dashboard/campaigns/create
 *
 * Body: { name, objective, dailyBudgetDollars }
 *
 * Creates a campaign + ad set in the connected ad account, both in
 * PAUSED status (no spend until subscriber explicitly activates them
 * in Meta Ads Manager). The ad layer is intentionally not created here
 * — fresh campaigns have no creative; the boost-winners flow handles
 * ad creation when there's an existing post to attach.
 *
 * Returns the new campaign ID. Caller refetches the campaigns list to
 * see it appear with effective_status=IN_PROCESS or PAUSED.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!session.activeSiteId) {
    return NextResponse.json({ error: "No active site" }, { status: 400 });
  }
  if (!session.plan.toLowerCase().includes("enterprise")) {
    return NextResponse.json({ error: "Enterprise tier required" }, { status: 403 });
  }

  const body = await req.json();
  const name = String(body.name || "").trim();
  const objective = String(body.objective || "").trim();
  const dailyBudgetDollars = Number(body.dailyBudgetDollars);
  const platformAssetId = body.adAccountId ? String(body.adAccountId) : null;

  if (!name) {
    return NextResponse.json({ error: "Campaign name is required" }, { status: 400 });
  }
  if (!objective) {
    return NextResponse.json({ error: "Objective is required" }, { status: 400 });
  }
  if (!Number.isFinite(dailyBudgetDollars) || dailyBudgetDollars < 1) {
    return NextResponse.json({ error: "Daily budget must be at least $1" }, { status: 400 });
  }

  const resolved = await resolveAdAccount({
    subscriptionId: session.subscriptionId,
    activeSiteId: session.activeSiteId,
    platformAssetId,
  });
  if (!resolved) {
    return NextResponse.json({ error: "No ad account connected" }, { status: 400 });
  }

  const { adAccountId, accessToken } = resolved;

  try {
    const campaign = await createCampaign(
      adAccountId,
      { name, objective, status: "PAUSED" },
      accessToken
    );
    const adSet = await createAdSet(
      adAccountId,
      {
        name: `${name} — default ad set`,
        campaignId: campaign.id,
        dailyBudgetCents: Math.round(dailyBudgetDollars * 100),
        status: "PAUSED",
      },
      accessToken
    );

    return NextResponse.json({
      campaignId: campaign.id,
      adSetId: adSet.id,
      status: "PAUSED",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "marketing_api_failed", message }, { status: 502 });
  }
}
