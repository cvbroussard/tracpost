import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getDeliveryEstimate } from "@/lib/meta-ads";
import { resolveAdAccount } from "@/lib/meta-ads-resolve";

/**
 * POST /api/compose/reach-forecast
 *
 * Returns Meta's predicted audience size for the supplied targeting +
 * budget combo. Powers the live forecast block on the Compose Reach
 * step. Re-fetched (debounced) when subscriber drags the radius or
 * budget sliders.
 *
 * Body:
 *   { latitude, longitude, radius_miles, daily_budget_dollars,
 *     ad_account_id? }
 *
 * Returns:
 *   { audienceLower, audienceUpper, dailyBudgetDollars, totalIfDays? }
 *
 * Uses the same getDeliveryEstimate machinery the Quick Boost flow uses,
 * but takes raw lat/lon directly (rather than building targeting from
 * the site's location cascade) so the Reach step can forecast for
 * subscriber-overridden hyperlocal locations.
 *
 * The estimate uses POST_ENGAGEMENT optimization — same as Quick Boost
 * defaults — so the predicted audience reflects the actual reach we'd
 * get when the boost fires.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.activeSiteId) return NextResponse.json({ error: "No active site" }, { status: 400 });
  if (!session.plan.toLowerCase().includes("enterprise")) {
    return NextResponse.json({ error: "Enterprise tier required" }, { status: 403 });
  }

  const body = await req.json();
  const lat = Number(body.latitude);
  const lon = Number(body.longitude);
  const radiusMiles = Number(body.radius_miles);
  const dailyBudgetDollars = Number(body.daily_budget_dollars);
  const adAccountId = body.ad_account_id ? String(body.ad_account_id) : null;

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ error: "latitude/longitude required" }, { status: 400 });
  }
  if (!Number.isFinite(radiusMiles) || radiusMiles < 1 || radiusMiles > 50) {
    return NextResponse.json({ error: "radius_miles must be 1-50" }, { status: 400 });
  }
  if (!Number.isFinite(dailyBudgetDollars) || dailyBudgetDollars < 1) {
    return NextResponse.json({ error: "daily_budget_dollars must be at least $1" }, { status: 400 });
  }

  const resolved = await resolveAdAccount({
    subscriptionId: session.subscriptionId,
    activeSiteId: session.activeSiteId,
    platformAssetId: adAccountId,
  });
  if (!resolved) {
    return NextResponse.json({ error: "No ad account connected" }, { status: 400 });
  }

  const { adAccountId: resolvedAdAccountId, accessToken } = resolved;

  // Build the targeting spec directly from the supplied lat/lon. This
  // bypasses buildQuickBoostTargeting() so the Reach step can forecast
  // for arbitrary hyperlocal overrides (Mount Lebanon for a Pittsburgh
  // canonical site, etc.) rather than always using the site's cascade.
  const targetingSpec = {
    geo_locations: {
      custom_locations: [
        { latitude: lat, longitude: lon, radius: radiusMiles, distance_unit: "mile" },
      ],
    },
    age_min: 18,
    age_max: 65,
    targeting_optimization: "expansion_all",
  };

  try {
    const estimate = await getDeliveryEstimate(
      resolvedAdAccountId,
      {
        targetingSpec,
        optimizationGoal: "POST_ENGAGEMENT",
        dailyBudgetCents: Math.round(dailyBudgetDollars * 100),
      },
      accessToken,
    );

    return NextResponse.json({
      estimateReady: estimate.estimateReady,
      audienceLower: estimate.audienceSizeLower,
      audienceUpper: estimate.audienceSizeUpper,
      dailyReachLower: estimate.dailyReachLower,
      dailyReachUpper: estimate.dailyReachUpper,
      dailyBudgetDollars,
      radiusMiles,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "forecast_failed", message },
      { status: 502 },
    );
  }
}
