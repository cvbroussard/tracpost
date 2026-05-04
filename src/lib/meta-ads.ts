/**
 * Marketing API + TracPost — Ads app OAuth utilities.
 *
 * Separate from the organic Meta app (lib/meta.ts) — the three-app
 * architecture isolates ads_management as a high-risk scope from the
 * organic publishing scopes. Different Meta App ID, different secret,
 * different callback, different scopes.
 *
 * Env vars required:
 *   META_ADS_APP_ID     — TracPost — Ads app on Meta Developer Dashboard
 *   META_ADS_APP_SECRET — corresponding secret
 *   NEXT_PUBLIC_APP_URL — for the redirect URI
 */

const GRAPH_BASE = "https://graph.facebook.com/v21.0";

const ADS_REDIRECT_PATH = "/api/auth/meta-ads/callback";

export const ADS_SCOPES = [
  "ads_management",
  "ads_read",
  "business_management",
  "pages_show_list",
  "pages_read_engagement",
  "public_profile",
];

export function getMetaAdsAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.META_ADS_APP_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}${ADS_REDIRECT_PATH}`,
    scope: ADS_SCOPES.join(","),
    response_type: "code",
    state,
  });
  return `https://www.facebook.com/v21.0/dialog/oauth?${params}`;
}

export async function exchangeAdsCodeForToken(code: string): Promise<{
  accessToken: string;
  expiresIn: number;
}> {
  const shortRes = await fetch(`${GRAPH_BASE}/oauth/access_token?` + new URLSearchParams({
    client_id: process.env.META_ADS_APP_ID!,
    client_secret: process.env.META_ADS_APP_SECRET!,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}${ADS_REDIRECT_PATH}`,
    code,
  }));
  const shortData = await shortRes.json();
  if (!shortRes.ok) {
    throw new Error(`Ads token exchange failed: ${JSON.stringify(shortData.error || shortData)}`);
  }

  const longRes = await fetch(`${GRAPH_BASE}/oauth/access_token?` + new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: process.env.META_ADS_APP_ID!,
    client_secret: process.env.META_ADS_APP_SECRET!,
    fb_exchange_token: shortData.access_token,
  }));
  const longData = await longRes.json();
  if (!longRes.ok) {
    throw new Error(`Ads long-lived token exchange failed: ${JSON.stringify(longData.error || longData)}`);
  }

  return {
    accessToken: longData.access_token,
    expiresIn: longData.expires_in || 5184000,
  };
}

export interface MetaAdAccount {
  id: string;            // 'act_123456789'
  accountId: string;     // '123456789' (no act_ prefix)
  name: string;
  currency: string;
  status: number;        // Meta numeric status: 1 = ACTIVE, 2 = DISABLED, 3 = UNSETTLED, 7 = PENDING_RISK_REVIEW, etc.
  amountSpent: string;   // string-encoded number
}

/**
 * Enumerate ad accounts the OAuth grant can access.
 * Returns ad accounts via the user's connected Business Manager(s).
 */
export async function discoverAdAccounts(accessToken: string): Promise<MetaAdAccount[]> {
  const res = await fetch(
    `${GRAPH_BASE}/me/adaccounts?fields=id,account_id,name,currency,account_status,amount_spent&access_token=${accessToken}`
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Ad account discovery failed: ${JSON.stringify(data.error || data)}`);
  }
  if (!Array.isArray(data.data)) return [];

  return data.data.map((a: Record<string, unknown>) => ({
    id: String(a.id),
    accountId: String(a.account_id),
    name: String(a.name || a.id),
    currency: String(a.currency || "USD"),
    status: Number(a.account_status ?? 0),
    amountSpent: String(a.amount_spent ?? "0"),
  }));
}

export interface MetaCampaign {
  id: string;
  name: string;
  objective: string;       // OUTCOME_TRAFFIC, OUTCOME_ENGAGEMENT, etc.
  status: string;          // ACTIVE, PAUSED, DELETED, ARCHIVED
  effectiveStatus: string; // ACTIVE, PAUSED, IN_PROCESS, etc.
  dailyBudget: string | null;
  lifetimeBudget: string | null;
  budgetRemaining: string | null;        // For lifetime-budget campaigns
  specialAdCategories: string[];         // ['HOUSING'], ['EMPLOYMENT'], [] etc.
  createdTime: string;
  startTime: string | null;
  stopTime: string | null;
  adCount: number | null;                // Total ads in this campaign
  firstAdSetTargeting: Record<string, unknown> | null;  // For audience summary display
}

/**
 * List campaigns under an ad account. Returns most recent first.
 */
export async function listCampaigns(
  adAccountId: string,
  accessToken: string
): Promise<MetaCampaign[]> {
  // adAccountId may be passed with or without 'act_' prefix; normalize
  const id = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;
  const fields = [
    "id",
    "name",
    "objective",
    "status",
    "effective_status",
    "daily_budget",
    "lifetime_budget",
    "budget_remaining",
    "special_ad_categories",
    "created_time",
    "start_time",
    "stop_time",
    "ads.summary(true).limit(0)",
    "adsets.limit(1){id,targeting}",
  ].join(",");
  const res = await fetch(
    `${GRAPH_BASE}/${id}/campaigns?fields=${fields}&limit=100&access_token=${accessToken}`
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`List campaigns failed: ${JSON.stringify(data.error || data)}`);
  }
  if (!Array.isArray(data.data)) return [];

  return data.data.map((c: Record<string, unknown>) => {
    const adsBlock = (c.ads || {}) as Record<string, unknown>;
    const adsSummary = (adsBlock.summary || {}) as Record<string, unknown>;
    const adSetsBlock = (c.adsets || {}) as Record<string, unknown>;
    const adSetsArr = (adSetsBlock.data || []) as Array<Record<string, unknown>>;
    const firstAdSet = adSetsArr.length > 0 ? adSetsArr[0] : null;
    const firstTargeting = firstAdSet && firstAdSet.targeting && typeof firstAdSet.targeting === "object"
      ? (firstAdSet.targeting as Record<string, unknown>)
      : null;

    return {
      id: String(c.id),
      name: String(c.name || ""),
      objective: String(c.objective || ""),
      status: String(c.status || ""),
      effectiveStatus: String(c.effective_status || ""),
      dailyBudget: c.daily_budget ? String(c.daily_budget) : null,
      lifetimeBudget: c.lifetime_budget ? String(c.lifetime_budget) : null,
      budgetRemaining: c.budget_remaining ? String(c.budget_remaining) : null,
      specialAdCategories: Array.isArray(c.special_ad_categories) ? c.special_ad_categories.map(String) : [],
      createdTime: String(c.created_time || ""),
      startTime: c.start_time ? String(c.start_time) : null,
      stopTime: c.stop_time ? String(c.stop_time) : null,
      adCount: typeof adsSummary.total_count === "number" ? adsSummary.total_count : null,
      firstAdSetTargeting: firstTargeting,
    };
  });
}

// ─── Objective helpers ──────────────────────────────────────────────

/**
 * Friendly subscriber-facing label for a Meta campaign objective.
 * Maps the API's OUTCOME_* enum to plain English.
 */
export function objectiveLabel(objective: string): string {
  switch (objective) {
    case "OUTCOME_TRAFFIC": return "Traffic to website";
    case "OUTCOME_ENGAGEMENT": return "Post engagement";
    case "OUTCOME_LEADS": return "Lead generation";
    case "OUTCOME_AWARENESS": return "Brand awareness";
    case "OUTCOME_SALES": return "Sales / conversions";
    case "OUTCOME_APP_PROMOTION": return "App promotion";
    // Legacy objectives still sometimes returned by older campaigns
    case "LINK_CLICKS": return "Traffic (legacy)";
    case "POST_ENGAGEMENT": return "Engagement (legacy)";
    case "PAGE_LIKES": return "Page likes (legacy)";
    case "VIDEO_VIEWS": return "Video views (legacy)";
    case "CONVERSIONS": return "Conversions (legacy)";
    case "REACH": return "Reach (legacy)";
    case "BRAND_AWARENESS": return "Brand awareness (legacy)";
    case "LEAD_GENERATION": return "Lead generation (legacy)";
    default: return objective;
  }
}

/**
 * Whether a campaign objective is a "legacy" objective from before
 * Meta's ODAX (simplified objectives) overhaul. Legacy campaigns
 * cannot accept new ad creation via the API — Meta returns
 * subcode 2490492 if you try. New objectives start with OUTCOME_*.
 */
export function isLegacyObjective(objective: string): boolean {
  if (!objective) return false;
  return !objective.startsWith("OUTCOME_");
}

/**
 * Map a campaign objective to a valid optimization_goal we can use
 * when creating a new ad set inside that campaign. Conservative
 * choices: prefer broadly compatible goals (LINK_CLICKS) over narrow
 * ones that require additional setup (CONVERSIONS needs pixel,
 * LEAD_GENERATION needs lead form).
 */
export function objectiveToOptimizationGoal(objective: string): string {
  switch (objective) {
    case "OUTCOME_ENGAGEMENT":
    case "POST_ENGAGEMENT":
      return "POST_ENGAGEMENT";
    case "OUTCOME_AWARENESS":
    case "REACH":
    case "BRAND_AWARENESS":
      return "REACH";
    case "OUTCOME_TRAFFIC":
    case "LINK_CLICKS":
    case "OUTCOME_LEADS":   // fallback — true LEAD_GENERATION needs lead form
    case "OUTCOME_SALES":   // fallback — true CONVERSIONS needs pixel
    default:
      return "LINK_CLICKS";
  }
}

/**
 * Fetch a single campaign's full settings — objective, status,
 * special_ad_categories, etc. Used by the boost flow to inherit
 * proper config when creating a new ad set inside a campaign.
 */
export async function getCampaignSettings(
  campaignId: string,
  accessToken: string
): Promise<{
  id: string;
  name: string;
  objective: string;
  status: string;
  effectiveStatus: string;
  specialAdCategories: string[];
  buyingType: string | null;
  dailyBudget: string | null;          // present when campaign uses CBO (campaign-level budget)
  lifetimeBudget: string | null;       // present when CBO with lifetime budget
  usesCBO: boolean;                    // derived: true if any budget is set at campaign level
}> {
  const fields = [
    "id",
    "name",
    "objective",
    "status",
    "effective_status",
    "special_ad_categories",
    "buying_type",
    "daily_budget",
    "lifetime_budget",
  ].join(",");
  const res = await fetch(`${GRAPH_BASE}/${campaignId}?fields=${fields}&access_token=${accessToken}`);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Get campaign settings failed: ${JSON.stringify(data.error || data)}`);
  }
  const dailyBudget = data.daily_budget ? String(data.daily_budget) : null;
  const lifetimeBudget = data.lifetime_budget ? String(data.lifetime_budget) : null;
  return {
    id: String(data.id),
    name: String(data.name || ""),
    objective: String(data.objective || ""),
    status: String(data.status || ""),
    effectiveStatus: String(data.effective_status || ""),
    specialAdCategories: Array.isArray(data.special_ad_categories) ? data.special_ad_categories.map(String) : [],
    buyingType: data.buying_type ? String(data.buying_type) : null,
    dailyBudget,
    lifetimeBudget,
    usesCBO: !!(dailyBudget || lifetimeBudget),
  };
}

export interface InheritedAdSetSettings {
  targeting: Record<string, unknown> | null;
  optimizationGoal: string | null;
  billingEvent: string | null;
  bidStrategy: string | null;
}

/**
 * Fetch the first ad set under a campaign and return the settings the
 * boost flow needs to inherit. Used to ensure new ad sets we create
 * inside a parent campaign mirror the subscriber's existing
 * configuration — Meta enforces consistency (same optimization_goal
 * across ad sets when campaign uses lowest_cost bid strategy / CBO).
 *
 * Returns null if the campaign has no ad sets yet (we'd then fall
 * back to default values).
 */
export async function getFirstAdSetSettings(
  campaignId: string,
  accessToken: string
): Promise<InheritedAdSetSettings | null> {
  const fields = "id,targeting,optimization_goal,billing_event,bid_strategy";
  const res = await fetch(
    `${GRAPH_BASE}/${campaignId}/adsets?fields=${fields}&limit=1&access_token=${accessToken}`
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Get ad set settings failed: ${JSON.stringify(data.error || data)}`);
  }
  if (!Array.isArray(data.data) || data.data.length === 0) return null;
  const adSet = data.data[0] as Record<string, unknown>;
  return {
    targeting: adSet.targeting && typeof adSet.targeting === "object"
      ? (adSet.targeting as Record<string, unknown>)
      : null,
    optimizationGoal: adSet.optimization_goal ? String(adSet.optimization_goal) : null,
    billingEvent: adSet.billing_event ? String(adSet.billing_event) : null,
    bidStrategy: adSet.bid_strategy ? String(adSet.bid_strategy) : null,
  };
}

/**
 * Update the status (ACTIVE / PAUSED) of any Marketing API entity —
 * Campaign, AdSet, or Ad. Meta uses the same POST /{entity_id} pattern
 * for all three. Status cascades downward (PAUSING a campaign
 * effectively pauses all its ad sets and ads).
 */
export async function setEntityStatus(
  entityId: string,
  status: "ACTIVE" | "PAUSED",
  accessToken: string
): Promise<void> {
  const body = new URLSearchParams({
    status,
    access_token: accessToken,
  });
  const res = await fetch(`${GRAPH_BASE}/${entityId}`, {
    method: "POST",
    body,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Set entity status failed: ${JSON.stringify(data.error || data)}`);
  }
}

/**
 * Fetch a delivery estimate for a given audience + budget + optimization
 * goal. Mirrors what Meta's native Boost UI shows below the form
 * ("Estimated daily results: 1,900-3,800 impressions"). Used by Quick
 * Boost to surface predicted reach as the subscriber adjusts the budget.
 *
 * Meta's estimate may take a moment to compute; if estimate_ready is
 * false on the first call, retry once after a brief delay.
 */
export interface DeliveryEstimate {
  estimateReady: boolean;
  dailyImpressionsLower: number | null;
  dailyImpressionsUpper: number | null;
  dailyActionsLower: number | null;
  dailyActionsUpper: number | null;
  dailyReachLower: number | null;
  dailyReachUpper: number | null;
  audienceSizeLower: number | null;
  audienceSizeUpper: number | null;
}

export async function getDeliveryEstimate(
  adAccountId: string,
  args: {
    targetingSpec: Record<string, unknown>;
    optimizationGoal: string;
    dailyBudgetCents: number;
  },
  accessToken: string
): Promise<DeliveryEstimate> {
  const id = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;

  async function fetchOnce(): Promise<DeliveryEstimate> {
    // Don't pass daily_budget — when we do, Meta sometimes returns a single
    // zero-valued curve point. Without it, Meta returns a richer curve we
    // can interpolate against our requested budget.
    const params = new URLSearchParams({
      targeting_spec: JSON.stringify(args.targetingSpec),
      optimization_goal: args.optimizationGoal,
      access_token: accessToken,
    });
    const res = await fetch(`${GRAPH_BASE}/${id}/delivery_estimate?${params}`);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(`Delivery estimate failed: ${JSON.stringify(data.error || data)}`);
    }

    // Log raw response for diagnosis — Meta's structure varies by API version
    // and optimization_goal. Strip when we know exactly what we get.
    console.log("delivery_estimate raw:", JSON.stringify(data));

    const row = (Array.isArray(data.data) && data.data.length > 0 ? data.data[0] : data) as Record<string, unknown>;
    const curve = (row.daily_outcomes_curve || []) as Array<Record<string, unknown>>;

    // The curve has multiple points across spend levels. Find the point
    // closest to our requested daily budget instead of just taking the last.
    function findClosestPoint(): Record<string, unknown> {
      if (curve.length === 0) return {};
      let closest = curve[0];
      let closestDiff = Infinity;
      for (const point of curve) {
        const pointSpend = Number(point.spend ?? point.daily_budget ?? 0);
        const diff = Math.abs(pointSpend - args.dailyBudgetCents);
        if (diff < closestDiff) {
          closestDiff = diff;
          closest = point;
        }
      }
      return closest;
    }
    const point = findClosestPoint();

    const num = (v: unknown): number | null => {
      if (v === null || v === undefined) return null;
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : null;
    };

    // Pull fields with multiple possible names — Meta varies them
    const impressions = num(point.impressions ?? point.estimated_impressions);
    const actions = num(point.actions ?? point.estimated_actions ?? point.post_engagement);
    const reach = num(point.reach ?? point.estimated_reach);

    return {
      estimateReady: row.estimate_ready === true,
      dailyImpressionsLower: impressions,
      dailyImpressionsUpper: impressions,
      dailyActionsLower: actions,
      dailyActionsUpper: actions,
      dailyReachLower: reach,
      dailyReachUpper: reach,
      // Meta returns audience as estimate_mau_lower_bound / estimate_mau_upper_bound
      // (monthly active users in the targeted audience).
      audienceSizeLower: num(row.estimate_mau_lower_bound),
      audienceSizeUpper: num(row.estimate_mau_upper_bound),
    };
  }

  let estimate = await fetchOnce();
  // Retry once if Meta hasn't computed it yet
  if (!estimate.estimateReady) {
    await new Promise((r) => setTimeout(r, 1500));
    estimate = await fetchOnce();
  }
  return estimate;
}

// ─── Read: ads under a campaign or account ─────────────────────────

export interface MetaAd {
  id: string;
  name: string;
  status: string;
  effectiveStatus: string;
  campaignId: string | null;
  adSetId: string | null;
  creativeId: string | null;
  objectStoryId: string | null;       // {pageId}_{postId} — FB boost
  effectiveInstagramMediaId: string | null;  // IG media ID — IG boost
  insights: CampaignInsights;
  thumbnailUrl: string | null;
}

/**
 * List ads under an ad account (optionally filtered to one campaign),
 * with creative + insights expanded in a single Graph call. Used by the
 * Campaigns drill-down + the already-promoted badge on the Promote tab.
 */
export async function listAds(
  adAccountId: string,
  accessToken: string,
  campaignId?: string
): Promise<MetaAd[]> {
  const id = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;
  const fields = [
    "id",
    "name",
    "status",
    "effective_status",
    "campaign_id",
    "adset_id",
    "creative{id,object_story_id,effective_instagram_media_id,thumbnail_url}",
    "insights.date_preset(maximum){spend,impressions,clicks,reach,cpc,cpm,ctr}",
  ].join(",");
  const params = new URLSearchParams({
    fields,
    limit: "200",
    access_token: accessToken,
  });
  if (campaignId) {
    params.set("filtering", JSON.stringify([{ field: "campaign.id", operator: "EQUAL", value: campaignId }]));
  }
  const res = await fetch(`${GRAPH_BASE}/${id}/ads?${params}`);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`List ads failed: ${JSON.stringify(data.error || data)}`);
  }
  if (!Array.isArray(data.data)) return [];

  return data.data.map((row: Record<string, unknown>) => {
    const creative = (row.creative || {}) as Record<string, unknown>;
    const insightsArr = ((row.insights || {}) as Record<string, unknown>).data as Array<Record<string, unknown>> | undefined;
    const insightsRow = insightsArr && insightsArr.length > 0 ? insightsArr[0] : {};
    return {
      id: String(row.id),
      name: String(row.name || ""),
      status: String(row.status || ""),
      effectiveStatus: String(row.effective_status || ""),
      campaignId: row.campaign_id ? String(row.campaign_id) : null,
      adSetId: row.adset_id ? String(row.adset_id) : null,
      creativeId: creative.id ? String(creative.id) : null,
      objectStoryId: creative.object_story_id ? String(creative.object_story_id) : null,
      effectiveInstagramMediaId: creative.effective_instagram_media_id
        ? String(creative.effective_instagram_media_id)
        : null,
      thumbnailUrl: creative.thumbnail_url ? String(creative.thumbnail_url) : null,
      insights: {
        spend: String(insightsRow.spend ?? "0"),
        impressions: String(insightsRow.impressions ?? "0"),
        clicks: String(insightsRow.clicks ?? "0"),
        reach: String(insightsRow.reach ?? "0"),
        cpc: String(insightsRow.cpc ?? "0"),
        cpm: String(insightsRow.cpm ?? "0"),
        ctr: String(insightsRow.ctr ?? "0"),
      },
    };
  });
}

// ─── Write operations ────────────────────────────────────────────────

export interface CreateCampaignParams {
  name: string;
  objective: string;        // e.g. 'OUTCOME_TRAFFIC' | 'OUTCOME_ENGAGEMENT' | 'OUTCOME_LEADS'
  status?: "ACTIVE" | "PAUSED";
  specialAdCategories?: string[];   // ['HOUSING'], ['EMPLOYMENT'], etc.
}

/**
 * Create a campaign in the given ad account. Returns the new campaign ID.
 * Defaults status to PAUSED so subscribers don't accidentally spend
 * money. specialAdCategories defaults to [] (no regulated categories).
 */
export async function createCampaign(
  adAccountId: string,
  params: CreateCampaignParams,
  accessToken: string
): Promise<{ id: string }> {
  const id = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;
  const body = new URLSearchParams({
    name: params.name,
    objective: params.objective,
    status: params.status || "PAUSED",
    special_ad_categories: JSON.stringify(params.specialAdCategories || []),
    access_token: accessToken,
  });
  const res = await fetch(`${GRAPH_BASE}/${id}/campaigns`, {
    method: "POST",
    body,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Create campaign failed: ${JSON.stringify(data.error || data)}`);
  }
  return { id: String(data.id) };
}

export interface CreateAdSetParams {
  name: string;
  campaignId: string;
  // Omit when the campaign uses CBO (Campaign Budget Optimization) —
  // Meta enforces "campaign budget XOR ad set budget", never both.
  dailyBudgetCents?: number;
  optimizationGoal?: string;       // default LINK_CLICKS
  billingEvent?: string;           // default IMPRESSIONS
  bidStrategy?: string;            // default LOWEST_COST_WITHOUT_CAP
  countryCodes?: string[];         // default ['US'] — only used if no explicit targeting
  targeting?: Record<string, unknown>;  // explicit targeting JSON (overrides countryCodes)
  status?: "ACTIVE" | "PAUSED";
  stopTime?: string;               // ISO timestamp; ad set ends when reached
}

/**
 * Create an ad set under a campaign. Returns the new ad set ID.
 *
 * Defaults are deliberately broad to make creation reliable for first
 * campaigns: US-only targeting, lowest-cost bid strategy, link-clicks
 * optimization. Subscribers can refine in Meta Ads Manager if needed.
 *
 * Ad set start_time defaults to immediate; Meta requires a non-past
 * timestamp. We send a 1-minute future offset to avoid clock skew
 * rejecting the call.
 */
export async function createAdSet(
  adAccountId: string,
  params: CreateAdSetParams,
  accessToken: string
): Promise<{ id: string }> {
  const id = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;
  const startTime = new Date(Date.now() + 60_000).toISOString();
  // Prefer explicit targeting when provided (e.g., inherited from a parent
  // campaign's existing ad set); otherwise fall back to broad country-only.
  const targeting = params.targeting
    ? params.targeting
    : { geo_locations: { countries: params.countryCodes || ["US"] } };
  const body = new URLSearchParams({
    name: params.name,
    campaign_id: params.campaignId,
    billing_event: params.billingEvent || "IMPRESSIONS",
    optimization_goal: params.optimizationGoal || "LINK_CLICKS",
    start_time: startTime,
    targeting: JSON.stringify(targeting),
    status: params.status || "PAUSED",
    access_token: accessToken,
  });
  // Only include daily_budget when not using campaign-level CBO; Meta
  // enforces budget at one level only.
  if (typeof params.dailyBudgetCents === "number") {
    body.set("daily_budget", String(params.dailyBudgetCents));
    // bid_strategy is meaningful at ad-set level only when ad set
    // owns the budget. Under CBO, bid_strategy lives at campaign level.
    body.set("bid_strategy", params.bidStrategy || "LOWEST_COST_WITHOUT_CAP");
  }
  if (params.stopTime) {
    body.set("end_time", params.stopTime);
  }
  const res = await fetch(`${GRAPH_BASE}/${id}/adsets`, {
    method: "POST",
    body,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Create ad set failed: ${JSON.stringify(data.error || data)}`);
  }
  return { id: String(data.id) };
}

/**
 * Live discovery: is the given Instagram Business account Page-linked
 * at the Meta business level? Required for paid IG ads — Meta's ad
 * infrastructure attributes IG placements via the Page-IG association.
 *
 * Uses the Ads OAuth token (pages_show_list + business_management).
 * Called just before each IG boost attempt so cached state never goes
 * stale relative to subscriber-side relinking at meta.com.
 *
 * Returns the linked Page info if found; { linked: false } otherwise.
 */
export async function verifyIgPageLink(
  igUserId: string,
  accessToken: string
): Promise<{ linked: boolean; pageId: string | null; pageName: string | null }> {
  const res = await fetch(
    `${GRAPH_BASE}/me/accounts?fields=id,name,instagram_business_account&access_token=${accessToken}`
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Page-IG link discovery failed: ${JSON.stringify(data.error || data)}`);
  }
  if (!Array.isArray(data.data)) {
    return { linked: false, pageId: null, pageName: null };
  }
  for (const page of data.data) {
    const ig = (page as Record<string, unknown>).instagram_business_account as { id?: string } | undefined;
    if (ig?.id === igUserId) {
      return {
        linked: true,
        pageId: String((page as Record<string, unknown>).id),
        pageName: String((page as Record<string, unknown>).name || ""),
      };
    }
  }
  return { linked: false, pageId: null, pageName: null };
}

export interface CreateBoostedAdParams {
  name: string;
  adSetId: string;
  platform: "facebook" | "instagram";
  // Facebook fields:
  pageId?: string;
  postId?: string;          // Page Post ID; full pageId_postId form preferred
  // Instagram fields:
  igMediaId?: string;       // The IG media object ID (from /{ig_user_id}/media)
  status?: "ACTIVE" | "PAUSED";
}

/**
 * Create an ad whose creative is an existing organic post — boost an
 * existing-post pattern. Branches on platform:
 *
 * - Facebook: creative references object_story_id ({pageId}_{postId}).
 * - Instagram: creative references effective_instagram_media_id, which
 *   resolves to the Page-linked IG account at the ad-account business
 *   level. Caller must verify the Page-IG link exists via
 *   verifyIgPageLink() before calling — this function does not pre-check.
 */
export async function createBoostedAd(
  adAccountId: string,
  params: CreateBoostedAdParams,
  accessToken: string
): Promise<{ creativeId: string; adId: string }> {
  const id = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;

  // Step 1 — creative (platform-specific)
  const creativeBody = new URLSearchParams({
    name: `${params.name} — creative`,
    access_token: accessToken,
  });

  if (params.platform === "facebook") {
    if (!params.pageId || !params.postId) {
      throw new Error("Facebook boost requires pageId and postId");
    }
    const objectStoryId = params.postId.includes("_")
      ? params.postId
      : `${params.pageId}_${params.postId}`;
    creativeBody.set("object_story_id", objectStoryId);
  } else {
    if (!params.igMediaId) {
      throw new Error("Instagram boost requires igMediaId");
    }
    creativeBody.set("effective_instagram_media_id", params.igMediaId);
  }

  const creativeRes = await fetch(`${GRAPH_BASE}/${id}/adcreatives`, {
    method: "POST",
    body: creativeBody,
  });
  const creativeData = await creativeRes.json();
  if (!creativeRes.ok) {
    throw new Error(`Create ad creative failed: ${JSON.stringify(creativeData.error || creativeData)}`);
  }

  // Step 2 — ad
  const adBody = new URLSearchParams({
    name: params.name,
    adset_id: params.adSetId,
    creative: JSON.stringify({ creative_id: String(creativeData.id) }),
    status: params.status || "PAUSED",
    access_token: accessToken,
  });
  const adRes = await fetch(`${GRAPH_BASE}/${id}/ads`, {
    method: "POST",
    body: adBody,
  });
  const adData = await adRes.json();
  if (!adRes.ok) {
    throw new Error(`Create ad failed: ${JSON.stringify(adData.error || adData)}`);
  }

  return { creativeId: String(creativeData.id), adId: String(adData.id) };
}

export interface CampaignInsights {
  spend: string;
  impressions: string;
  clicks: string;
  reach: string;
  cpc: string;
  cpm: string;
  ctr: string;
}

/**
 * Fetch lifetime insights for a campaign. Returns zero-filled values if
 * the campaign has no impressions yet.
 */
export async function getCampaignInsights(
  campaignId: string,
  accessToken: string
): Promise<CampaignInsights> {
  const fields = ["spend", "impressions", "clicks", "reach", "cpc", "cpm", "ctr"].join(",");
  const res = await fetch(
    `${GRAPH_BASE}/${campaignId}/insights?fields=${fields}&date_preset=maximum&access_token=${accessToken}`
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Campaign insights failed: ${JSON.stringify(data.error || data)}`);
  }
  const row = Array.isArray(data.data) && data.data.length > 0 ? data.data[0] : {};
  return {
    spend: String(row.spend ?? "0"),
    impressions: String(row.impressions ?? "0"),
    clicks: String(row.clicks ?? "0"),
    reach: String(row.reach ?? "0"),
    cpc: String(row.cpc ?? "0"),
    cpm: String(row.cpm ?? "0"),
    ctr: String(row.ctr ?? "0"),
  };
}
