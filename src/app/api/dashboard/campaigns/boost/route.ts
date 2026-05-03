import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { createCampaign, createAdSet, createBoostedAd } from "@/lib/meta-ads";
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
  // Optional: attach this boost to an existing campaign instead of
  // creating a new campaign for it. Empty string / null = create new.
  const existingCampaignId = String(body.campaignId || "").trim();
  // Optional: explicit ad account choice; falls back to primary if absent
  const platformAssetId = body.adAccountId ? String(body.adAccountId) : null;

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
    // Either reuse the existing campaign or create a new one for this boost.
    let campaignId: string;
    if (existingCampaignId) {
      campaignId = existingCampaignId;
    } else {
      const campaign = await createCampaign(
        adAccountId,
        { name, objective: "OUTCOME_ENGAGEMENT", status: "PAUSED" },
        accessToken
      );
      campaignId = campaign.id;
    }

    const adSet = await createAdSet(
      adAccountId,
      {
        name: `${name} — ad set`,
        campaignId,
        dailyBudgetCents: Math.round(dailyBudgetDollars * 100),
        optimizationGoal: "POST_ENGAGEMENT",
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
      campaignId,
      adSetId: adSet.id,
      adId: ad.adId,
      creativeId: ad.creativeId,
      status: "PAUSED",
      attachedToExistingCampaign: !!existingCampaignId,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";

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
