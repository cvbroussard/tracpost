import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getDeliveryEstimate } from "@/lib/meta-ads";
import { resolveAdAccount } from "@/lib/meta-ads-resolve";
import { buildQuickBoostTargeting } from "@/lib/meta-ads-targeting";

/**
 * POST /api/dashboard/campaigns/boost-estimate
 *
 * Body: { dailyBudgetDollars, adAccountId? }
 *
 * Returns Meta's predicted reach for a Quick Boost with the
 * Advantage+ targeting defaults at the given budget. Mirrors the
 * "Estimated daily results" block in Meta's native Boost UI.
 *
 * Hardcodes the Quick Boost defaults (Advantage+ Audience expansion,
 * POST_ENGAGEMENT optimization). For the Attach-to-existing path,
 * Meta's own UI is the better proofing surface — we don't try to
 * predict reach for arbitrary inherited campaign settings.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!session.activeSiteId) return NextResponse.json({ error: "No active site" }, { status: 400 });
  if (!session.plan.toLowerCase().includes("enterprise")) {
    return NextResponse.json({ error: "Enterprise tier required" }, { status: 403 });
  }

  const body = await req.json();
  const dailyBudgetDollars = Number(body.dailyBudgetDollars);
  const platformAssetId = body.adAccountId ? String(body.adAccountId) : null;
  const targetingScope: "local" | "broad" =
    body.targetingScope === "broad" ? "broad" : "local";
  const radiusMiles = Number.isFinite(Number(body.radiusMiles)) ? Number(body.radiusMiles) : undefined;

  if (!Number.isFinite(dailyBudgetDollars) || dailyBudgetDollars < 1) {
    return NextResponse.json({ error: "dailyBudgetDollars must be at least $1" }, { status: 400 });
  }

  const resolved = await resolveAdAccount({
    subscriptionId: session.subscriptionId,
    activeSiteId: session.activeSiteId,
    platformAssetId,
  });
  if (!resolved) return NextResponse.json({ error: "No ad account connected" }, { status: 400 });

  const { adAccountId, accessToken } = resolved;

  // Use the same targeting the Quick Boost will use — local-area by default
  const targetingResult = await buildQuickBoostTargeting({
    siteId: session.activeSiteId,
    scope: targetingScope,
    accessToken,
    radiusMiles,
  });

  try {
    const estimate = await getDeliveryEstimate(
      adAccountId,
      {
        targetingSpec: targetingResult.targeting,
        optimizationGoal: "POST_ENGAGEMENT",
        dailyBudgetCents: Math.round(dailyBudgetDollars * 100),
      },
      accessToken
    );
    return NextResponse.json({ ...estimate, resolvedCityName: targetingResult.resolvedCityName });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "estimate_failed", message }, { status: 502 });
  }
}
