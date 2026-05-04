import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  createAdSet,
  createBoostedAd,
  getCampaignSettings,
  getFirstAdSetSettings,
  objectiveToOptimizationGoal,
} from "@/lib/meta-ads";
import { resolveAdAccount } from "@/lib/meta-ads-resolve";

/**
 * POST /api/dashboard/campaigns/boost
 *
 * Body: { postId, pageId, pageName, name, dailyBudgetDollars }
 *
 * Boost-winners flow: takes an existing organic Page post and creates
 * a paid campaign that promotes it. Full Meta hierarchy (campaign +
 * ad set + ad-with-creative). All in PAUSED status — subscriber
 * activates when ready.
 *
 * Uses object_story_id (the Page Post ID) so no new creative authoring
 * is needed; the existing post becomes the ad creative.
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
  const platform = (String(body.platform || "facebook").trim().toLowerCase()) as "facebook" | "instagram";
  const postId = String(body.postId || "").trim();
  const pageId = String(body.pageId || "").trim();
  const pageName = String(body.pageName || "").trim();
  const igMediaId = String(body.igMediaId || "").trim();
  const igUserId = String(body.igUserId || "").trim();
  const igUsername = String(body.igUsername || "").trim();
  const name = String(body.name || "").trim() || `Boost: ${pageName || igUsername || "post"}`;
  const dailyBudgetDollars = Number(body.dailyBudgetDollars);
  // REQUIRED: existing campaign to attach this boost to. Boosts no
  // longer create new campaigns — subscribers configure campaign
  // structure (objective, audience, budget, special ad categories)
  // intentionally in Meta Ads Manager. TracPost adds the boost as a
  // new ad set + ad inside the chosen campaign, inheriting the
  // campaign's objective and the first ad set's targeting.
  const targetCampaignId = String(body.campaignId || "").trim();
  // Optional: explicit ad account choice; falls back to primary if absent
  const platformAssetId = body.adAccountId ? String(body.adAccountId) : null;

  if (!targetCampaignId) {
    return NextResponse.json({
      error: "campaignId required",
      message: "Boosts must attach to an existing campaign. Set up your campaign in Meta Ads Manager first, then try again.",
    }, { status: 400 });
  }

  if (platform === "facebook") {
    if (!postId || !pageId) {
      return NextResponse.json({ error: "postId and pageId required for facebook boost" }, { status: 400 });
    }
  } else if (platform === "instagram") {
    if (!igMediaId || !igUserId) {
      return NextResponse.json({ error: "igMediaId and igUserId required for instagram boost" }, { status: 400 });
    }
  } else {
    return NextResponse.json({ error: `unknown platform: ${platform}` }, { status: 400 });
  }

  // Daily budget is only required when the campaign doesn't use CBO.
  // We validate it lazily after we've fetched campaign settings below.

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
    // Inherit settings from the chosen campaign:
    //   - First existing ad set's targeting, optimization_goal,
    //     billing_event — use verbatim. Meta enforces consistency
    //     across ad sets when campaign uses lowest_cost bid strategy
    //     (Campaign Budget Optimization), so mirroring the existing
    //     ad set is the only safe choice.
    //   - If no ad set exists yet, fall back to mapping campaign
    //     objective → reasonable optimization_goal default.
    const campaign = await getCampaignSettings(targetCampaignId, accessToken);
    const inheritedAdSet = await getFirstAdSetSettings(targetCampaignId, accessToken);

    // CBO check: when the campaign has a budget set at the campaign
    // level, Meta enforces "campaign budget XOR ad set budget" — we
    // must NOT pass daily_budget on the ad set or Meta returns
    // subcode 1885621.
    if (!campaign.usesCBO && (!Number.isFinite(dailyBudgetDollars) || dailyBudgetDollars < 1)) {
      return NextResponse.json({
        error: "budget_required",
        message: "This campaign uses ad-set budgets. Daily budget must be at least $1.",
      }, { status: 400 });
    }

    const optimizationGoal = inheritedAdSet?.optimizationGoal
      || objectiveToOptimizationGoal(campaign.objective);
    const billingEvent = inheritedAdSet?.billingEvent || "IMPRESSIONS";
    const inheritedTargeting = inheritedAdSet?.targeting || null;

    const adSet = await createAdSet(
      adAccountId,
      {
        name: `${name} — ad set`,
        campaignId: targetCampaignId,
        // Omit dailyBudgetCents when campaign uses CBO — Meta enforces
        // budget at one level only.
        ...(campaign.usesCBO ? {} : { dailyBudgetCents: Math.round(dailyBudgetDollars * 100) }),
        optimizationGoal,
        billingEvent,
        targeting: inheritedTargeting || undefined,
        status: "PAUSED",
      },
      accessToken
    );
    const ad = await createBoostedAd(
      adAccountId,
      {
        name,
        adSetId: adSet.id,
        platform,
        pageId: platform === "facebook" ? pageId : undefined,
        postId: platform === "facebook" ? postId : undefined,
        igMediaId: platform === "instagram" ? igMediaId : undefined,
        status: "PAUSED",
      },
      accessToken
    );

    return NextResponse.json({
      platform,
      campaignId: targetCampaignId,
      campaignName: campaign.name,
      adSetId: adSet.id,
      adId: ad.adId,
      creativeId: ad.creativeId,
      status: "PAUSED",
      inheritedFromExistingAdSet: inheritedAdSet !== null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";

    // Translate Meta's legacy-objective error into actionable coaching.
    // Subcode 2490492: "Legacy objective is no longer available in ad
    // creation." Happens when subscriber tries to add an ad to a
    // pre-ODAX campaign (LINK_CLICKS, POST_ENGAGEMENT, etc.).
    if (message.includes("2490492") || message.toLowerCase().includes("legacy objective")) {
      return NextResponse.json({
        error: "legacy_objective",
        message:
          "This campaign uses a legacy objective that Meta no longer accepts for new ads. Create a new campaign in Meta Ads Manager with a current objective (Traffic, Engagement, Leads, Awareness, or Sales), then attach this boost to it.",
      }, { status: 400 });
    }

    // Translate IG Page-link-style errors into actionable coaching.
    // Meta's typical error messages around this include phrases like
    // "Instagram account is not connected to a Page", "no Instagram
    // Business Account", or "Page is not connected to an Instagram
    // account". Match loosely; pass through anything else verbatim.
    if (platform === "instagram") {
      const lower = message.toLowerCase();
      const looksLikeLinkProblem =
        lower.includes("instagram") &&
        (lower.includes("not connected") || lower.includes("no instagram") || lower.includes("not linked") || lower.includes("not associated") || lower.includes("page-backed"));
      if (looksLikeLinkProblem) {
        return NextResponse.json({
          error: "ig_not_page_linked",
          message:
            "This Instagram boost can't be created because the IG account isn't linked to a Facebook Page at Meta. Set up the link at meta.com → Page Settings → Linked Accounts → Instagram, then try again. (No need to re-connect TracPost — the link is picked up live.)",
        }, { status: 400 });
      }
    }

    return NextResponse.json({ error: "marketing_api_failed", message }, { status: 502 });
  }
}
