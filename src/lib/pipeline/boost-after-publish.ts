import { sql } from "@/lib/db";
import {
  createCampaign,
  createAdSet,
  createBoostedAd,
} from "@/lib/meta-ads";
import { resolveAdAccount } from "@/lib/meta-ads-resolve";

/**
 * Phase 5/5 of task #92 (Compose Reach step) — auto-boost-after-publish chain.
 *
 * Called from publishPost() after a successful organic publish when the post's
 * metadata.reach.mode === 'both'. Reads the persisted reach data (set by
 * /api/compose/publish), wraps the just-published post in a Quick Boost
 * campaign using object_story_id = the platform_post_id Meta returned.
 *
 * Mirrors the Quick Boost flow at /api/dashboard/campaigns/boost without
 * requiring a session — operates server-to-server using the resolved ad
 * account's stored access token. Updates social_posts.metadata.reach with
 * boostQueued: true (success) or boostFailedReason: <message> (failure).
 *
 * Boost failure does NOT fail the publish — the post stays organic, and
 * the failure surfaces in the Compose published-state UI when refreshed.
 */
export interface ReachData {
  mode: "organic" | "paid" | "both";
  latitude?: number;
  longitude?: number;
  radiusMiles?: number;
  placeName?: string;
  placeId?: string;
  isOverride?: boolean;
  dailyBudgetDollars?: number;
  durationDays?: number;
}

export interface BoostAfterPublishContext {
  postId: string;
  platformPostId: string;       // What the publish API returned (FB post id, IG media id)
  platform: "facebook" | "instagram";
  platformAccountId: string;    // FB Page ID for facebook; IG user ID for instagram
}

export async function boostPostAfterPublish(
  ctx: BoostAfterPublishContext,
  reach: ReachData,
): Promise<{ success: boolean; campaignId?: string; error?: string }> {
  const { postId, platformPostId, platform, platformAccountId } = ctx;

  if (reach.mode !== "both") {
    return { success: false, error: "boost-after-publish only fires for mode='both'" };
  }
  if (!reach.latitude || !reach.longitude || !reach.radiusMiles) {
    return { success: false, error: "Missing reach targeting (latitude/longitude/radius)" };
  }
  if (!reach.dailyBudgetDollars || !reach.durationDays) {
    return { success: false, error: "Missing reach budget or duration" };
  }
  if (platform !== "facebook" && platform !== "instagram") {
    return { success: false, error: `Unsupported platform for boost: ${platform}` };
  }

  // Look up subscription + active site for ad account resolution
  const [postContext] = await sql`
    SELECT sp.id AS post_id, sp.site_id, sa.subscription_id
    FROM social_posts sp
    JOIN social_accounts sa ON sa.id = sp.account_id
    WHERE sp.id = ${postId}
  `;
  if (!postContext) {
    return { success: false, error: "Post not found" };
  }

  const resolved = await resolveAdAccount({
    subscriptionId: postContext.subscription_id as string,
    activeSiteId: postContext.site_id as string,
    platformAssetId: null,
  });
  if (!resolved) {
    return { success: false, error: "No ad account connected to subscription" };
  }
  const { adAccountId, accessToken } = resolved;

  // Targeting spec from the persisted reach data.
  // Same shape as buildQuickBoostTargeting output but constructed inline
  // since we have a precise lat/lon (possibly from a per-post override).
  const targeting = {
    geo_locations: {
      custom_locations: [
        {
          latitude: reach.latitude,
          longitude: reach.longitude,
          radius: reach.radiusMiles,
          distance_unit: "mile",
        },
      ],
    },
    age_min: 18,
    age_max: 65,
    targeting_optimization: "expansion_all",
  };

  const stopTime = new Date(
    Date.now() + Math.floor(reach.durationDays) * 86400000,
  ).toISOString();

  const campaignName = `Compose-both — post ${postId.slice(0, 8)}`;

  try {
    const campaign = await createCampaign(
      adAccountId,
      {
        name: campaignName,
        objective: "OUTCOME_ENGAGEMENT",
        status: "ACTIVE",
        specialAdCategories: [],
      },
      accessToken,
    );

    const adSet = await createAdSet(
      adAccountId,
      {
        name: `${campaignName} — ad set`,
        campaignId: campaign.id,
        dailyBudgetCents: Math.round(reach.dailyBudgetDollars * 100),
        optimizationGoal: "POST_ENGAGEMENT",
        billingEvent: "IMPRESSIONS",
        targeting,
        status: "ACTIVE",
        destinationType: "ON_POST",
        stopTime,
      },
      accessToken,
    );

    await createBoostedAd(
      adAccountId,
      {
        name: campaignName,
        adSetId: adSet.id,
        platform,
        pageId: platform === "facebook" ? platformAccountId : undefined,
        postId: platform === "facebook" ? platformPostId : undefined,
        igMediaId: platform === "instagram" ? platformPostId : undefined,
        status: "ACTIVE",
      },
      accessToken,
    );

    // Update post metadata: boost succeeded
    await sql`
      UPDATE social_posts
      SET metadata = jsonb_set(
        COALESCE(metadata, '{}'::jsonb),
        '{reach,boostQueued}',
        'true'::jsonb,
        true
      )
      WHERE id = ${postId}
    `;
    await sql`
      UPDATE social_posts
      SET metadata = jsonb_set(
        metadata,
        '{reach,boostCampaignId}',
        ${JSON.stringify(campaign.id)}::jsonb,
        true
      )
      WHERE id = ${postId}
    `;

    return { success: true, campaignId: campaign.id };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";

    // Update post metadata: boost failed (post stays organic)
    await sql`
      UPDATE social_posts
      SET metadata = jsonb_set(
        COALESCE(metadata, '{}'::jsonb),
        '{reach,boostFailedReason}',
        ${JSON.stringify(message.slice(0, 500))}::jsonb,
        true
      )
      WHERE id = ${postId}
    `;

    return { success: false, error: message };
  }
}
