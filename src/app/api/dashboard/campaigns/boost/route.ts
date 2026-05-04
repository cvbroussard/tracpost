import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  createCampaign,
  createAdSet,
  createBoostedAd,
  getCampaignSettings,
  getFirstAdSetSettings,
  objectiveToOptimizationGoal,
} from "@/lib/meta-ads";
import { buildQuickBoostTargeting } from "@/lib/meta-ads-targeting";
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
  // Two boost modes:
  //   1. Quick Boost (default) — create a fresh campaign + ad set + ad
  //      with Advantage+ defaults. Mirrors Meta's native Boost button.
  //      Bypasses inheritance issues from existing campaigns.
  //   2. Attach to existing campaign — sophisticated path. Inherits
  //      objective + targeting + optimization from existing ad set.
  const quickBoost = body.quickBoost === true;
  const targetCampaignId = String(body.campaignId || "").trim();
  // Optional: explicit ad account choice; falls back to primary if absent
  const platformAssetId = body.adAccountId ? String(body.adAccountId) : null;

  // Quick Boost params (ignored when attaching to existing campaign)
  const specialAdCategories = Array.isArray(body.specialAdCategories)
    ? body.specialAdCategories.map(String)
    : [];
  const durationDays = Number(body.durationDays);
  const runContinuously = body.runContinuously === true;
  const targetingScope: "local" | "broad" =
    body.targetingScope === "broad" ? "broad" : "local";
  const radiusMiles = Number.isFinite(Number(body.radiusMiles)) ? Number(body.radiusMiles) : undefined;
  // Status defaults: Quick Boost defaults to ACTIVE (matches Meta's native UX
  // when subscriber sees disclosure and clicks Create). Subscriber can opt
  // into "Save as paused" via UI toggle. Attach mode defaults to PAUSED for
  // safety since the boost joins an existing structure.
  const requestedStatus: "ACTIVE" | "PAUSED" =
    body.status === "PAUSED" || body.status === "ACTIVE"
      ? body.status
      : (quickBoost ? "ACTIVE" : "PAUSED");

  if (!quickBoost && !targetCampaignId) {
    return NextResponse.json({
      error: "campaignId required",
      message: "Either set quickBoost: true or provide a campaignId to attach the boost to.",
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
    let campaignId: string;
    let campaignName: string;
    let adSetParams: Parameters<typeof createAdSet>[1];

    if (quickBoost) {
      // ── Quick Boost path ──────────────────────────────────────────
      // Mirror Meta's native Boost button: fresh campaign, fresh ad set
      // with Advantage+ defaults, fresh ad. PAUSED status — subscriber
      // activates explicitly. Bypasses all the inheritance issues.
      if (!Number.isFinite(dailyBudgetDollars) || dailyBudgetDollars < 1) {
        return NextResponse.json({
          error: "budget_required",
          message: "Daily budget must be at least $1 for Quick Boost.",
        }, { status: 400 });
      }

      const created = await createCampaign(
        adAccountId,
        {
          name,
          objective: "OUTCOME_ENGAGEMENT",
          status: requestedStatus,
          specialAdCategories,
        },
        accessToken
      );
      campaignId = created.id;
      campaignName = name;

      // Compute stop_time (end of duration) unless subscriber chose continuous
      let stopTime: string | undefined;
      if (!runContinuously && Number.isFinite(durationDays) && durationDays >= 1) {
        stopTime = new Date(Date.now() + Math.floor(durationDays) * 86400000).toISOString();
      }

      // Advantage+ defaults via minimal targeting + targeting_optimization
      // expansion_all flag. No specific placements = Advantage+ Placements
      // (Meta picks across FB / IG / Messenger / Audience Network / WhatsApp).
      // Local targeting is the default for our subscriber profile (mid-market
      // service businesses with local service areas) — broad-US is wasteful.
      const targetingResult = await buildQuickBoostTargeting({
        siteId: session.activeSiteId,
        scope: targetingScope,
        accessToken,
        radiusMiles,
      });
      const advantagePlusTargeting = targetingResult.targeting;

      adSetParams = {
        name: `${name} — ad set`,
        campaignId,
        dailyBudgetCents: Math.round(dailyBudgetDollars * 100),
        optimizationGoal: "POST_ENGAGEMENT",
        billingEvent: "IMPRESSIONS",
        targeting: advantagePlusTargeting,
        status: requestedStatus,
        ...(stopTime ? { stopTime } : {}),
      };
    } else {
      // ── Attach to existing campaign path ──────────────────────────
      // Inherit objective + ad set settings from the chosen campaign.
      // Meta enforces consistency across ad sets when campaign uses
      // CBO (lowest_cost bid strategy).
      const campaign = await getCampaignSettings(targetCampaignId, accessToken);
      const inheritedAdSet = await getFirstAdSetSettings(targetCampaignId, accessToken);

      if (!campaign.usesCBO && (!Number.isFinite(dailyBudgetDollars) || dailyBudgetDollars < 1)) {
        return NextResponse.json({
          error: "budget_required",
          message: "This campaign uses ad-set budgets. Daily budget must be at least $1.",
        }, { status: 400 });
      }

      campaignId = targetCampaignId;
      campaignName = campaign.name;

      const optimizationGoal = inheritedAdSet?.optimizationGoal
        || objectiveToOptimizationGoal(campaign.objective);
      const billingEvent = inheritedAdSet?.billingEvent || "IMPRESSIONS";
      const inheritedTargeting = inheritedAdSet?.targeting || null;

      adSetParams = {
        name: `${name} — ad set`,
        campaignId,
        ...(campaign.usesCBO ? {} : { dailyBudgetCents: Math.round(dailyBudgetDollars * 100) }),
        optimizationGoal,
        billingEvent,
        targeting: inheritedTargeting || undefined,
        status: requestedStatus,
      };
    }

    const adSet = await createAdSet(adAccountId, adSetParams, accessToken);
    const ad = await createBoostedAd(
      adAccountId,
      {
        name,
        adSetId: adSet.id,
        platform,
        pageId: platform === "facebook" ? pageId : undefined,
        postId: platform === "facebook" ? postId : undefined,
        igMediaId: platform === "instagram" ? igMediaId : undefined,
        status: requestedStatus,
      },
      accessToken
    );

    return NextResponse.json({
      platform,
      campaignId,
      campaignName,
      adSetId: adSet.id,
      adId: ad.adId,
      creativeId: ad.creativeId,
      status: requestedStatus,
      mode: quickBoost ? "quick_boost" : "attach_existing",
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
