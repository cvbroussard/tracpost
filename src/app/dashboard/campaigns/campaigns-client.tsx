"use client";

import { useEffect, useState } from "react";
import { PlatformIcon } from "@/components/platform-icons";

interface Props {
  siteId: string;
}

interface AdAccount {
  platformAssetId: string;
  id: string;          // act_123456789
  name: string;
  accountId: string;
  currency: string;
  status: number | null;
  amountSpent: string;
  isPrimary?: boolean;
  isAssigned?: boolean;
}

const STATUS_LABELS: Record<number, string> = {
  1: "Active",
  2: "Disabled",
  3: "Unsettled",
  7: "Pending review",
  8: "Pending settlement",
  9: "Grace period",
  100: "Pending closure",
  101: "Closed",
};

function statusDotColor(status: number | null): string {
  if (status === 1) return "bg-success";
  if (status === 9) return "bg-warning";
  if (status === 100 || status === 101) return "bg-danger";
  if (status === null) return "bg-border";
  return "bg-warning";
}

// Whether a campaign objective predates Meta's ODAX overhaul.
// Legacy-objective campaigns reject new ad creation via the API.
function isLegacyObjective(objective: string): boolean {
  if (!objective) return false;
  return !objective.startsWith("OUTCOME_");
}

// Friendly objective labels for subscriber-facing display
function objectiveLabel(objective: string): string {
  switch (objective) {
    case "OUTCOME_TRAFFIC": return "Traffic to website";
    case "OUTCOME_ENGAGEMENT": return "Post engagement";
    case "OUTCOME_LEADS": return "Lead generation";
    case "OUTCOME_AWARENESS": return "Brand awareness";
    case "OUTCOME_SALES": return "Sales / conversions";
    case "OUTCOME_APP_PROMOTION": return "App promotion";
    case "LINK_CLICKS": return "Traffic (legacy)";
    case "POST_ENGAGEMENT": return "Engagement (legacy)";
    case "PAGE_LIKES": return "Page likes (legacy)";
    case "VIDEO_VIEWS": return "Video views (legacy)";
    case "CONVERSIONS": return "Conversions (legacy)";
    case "REACH": return "Reach (legacy)";
    case "BRAND_AWARENESS": return "Brand awareness (legacy)";
    case "LEAD_GENERATION": return "Lead generation (legacy)";
    default: return objective || "Unknown";
  }
}

function metaAdsManagerUrl(accountIdWithPrefix: string, campaignId?: string): string {
  // accountIdWithPrefix is "act_xxx" — strip the prefix for the URL
  const accountIdNumeric = accountIdWithPrefix.replace(/^act_/, "");
  const base = `https://business.facebook.com/adsmanager/manage/campaigns?act=${accountIdNumeric}`;
  return campaignId ? `${base}&selected_campaign_ids=${campaignId}` : base;
}

interface CampaignRow {
  id: string;
  name: string;
  objective: string;
  status: string;
  effectiveStatus: string;
  dailyBudget: string | null;
  lifetimeBudget: string | null;
  budgetRemaining: string | null;
  specialAdCategories: string[];
  createdTime: string;
  startTime: string | null;
  stopTime: string | null;
  adCount: number | null;
  firstAdSetTargeting: Record<string, unknown> | null;
  insights: {
    spend: string;
    impressions: string;
    clicks: string;
    reach: string;
    cpc: string;
    cpm: string;
    ctr: string;
  };
}

function humanizeTargeting(t: Record<string, unknown> | null): string {
  if (!t) return "";
  const parts: string[] = [];

  const geo = t.geo_locations as Record<string, unknown> | undefined;
  if (geo) {
    const countries = Array.isArray(geo.countries) ? geo.countries.map(String) : [];
    const regions = Array.isArray(geo.regions) ? geo.regions : [];
    const cities = Array.isArray(geo.cities) ? geo.cities : [];
    if (cities.length > 0) parts.push(`${cities.length} ${cities.length === 1 ? "city" : "cities"}`);
    else if (regions.length > 0) parts.push(`${regions.length} region${regions.length !== 1 ? "s" : ""}`);
    else if (countries.length === 1) parts.push(countries[0]);
    else if (countries.length > 1) parts.push(`${countries.length} countries`);
  }

  const ageMin = typeof t.age_min === "number" ? t.age_min : null;
  const ageMax = typeof t.age_max === "number" ? t.age_max : null;
  if (ageMin !== null && ageMax !== null) parts.push(`${ageMin}-${ageMax}`);
  else if (ageMin !== null) parts.push(`${ageMin}+`);

  const genders = Array.isArray(t.genders) ? t.genders : [];
  if (genders.length === 1) parts.push(genders[0] === 1 ? "Men" : "Women");

  const flexCount = Array.isArray(t.flexible_spec) ? t.flexible_spec.length : 0;
  const interests = Array.isArray(t.interests) ? t.interests.length : 0;
  const totalInterests = flexCount + interests;
  if (totalInterests > 0) parts.push(`${totalInterests} interest${totalInterests !== 1 ? "s" : ""}`);

  const customAudiences = Array.isArray(t.custom_audiences) ? t.custom_audiences : [];
  if (customAudiences.length > 0) parts.push(`+${customAudiences.length} custom`);

  return parts.length > 0 ? parts.join(" · ") : "Broad targeting";
}

function daysRemaining(stopTime: string | null): number | null {
  if (!stopTime) return null;
  const ms = new Date(stopTime).getTime();
  if (isNaN(ms)) return null;
  return Math.max(0, Math.ceil((ms - Date.now()) / 86400000));
}

interface TopPost {
  id: string;
  platform: string;
  pageId: string | null;
  pageName: string | null;
  igUserId: string | null;
  igUsername: string | null;
  igMediaId: string | null;
  caption: string;
  image: string | null;
  permalinkUrl: string | null;
  createdTime: string;
  engagement: number;
}

interface MetaAd {
  id: string;
  name: string;
  status: string;
  effectiveStatus: string;
  campaignId: string | null;
  adSetId: string | null;
  creativeId: string | null;
  objectStoryId: string | null;
  effectiveInstagramMediaId: string | null;
  thumbnailUrl: string | null;
  insights: {
    spend: string;
    impressions: string;
    clicks: string;
    reach: string;
    cpc: string;
    cpm: string;
    ctr: string;
  };
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-800",
  PAUSED: "bg-amber-100 text-amber-800",
  DELETED: "bg-gray-100 text-gray-500",
  ARCHIVED: "bg-gray-100 text-gray-500",
};

function fmtMoney(amount: string, currency = "USD"): string {
  const n = parseFloat(amount);
  if (Number.isNaN(n)) return `${currency} ${amount}`;
  return n.toLocaleString(undefined, { style: "currency", currency, maximumFractionDigits: 2 });
}

function fmtBudgetCents(cents: string | null): string {
  if (!cents) return "—";
  const n = parseInt(cents, 10);
  if (Number.isNaN(n)) return cents;
  return `$${(n / 100).toFixed(2)}/day`;
}

function fmtDate(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function CampaignsClient(_props: Props) {
  const [activeTab, setActiveTab] = useState<"campaigns" | "promote">("campaigns");

  const [adAccount, setAdAccount] = useState<AdAccount | null>(null);
  const [adAccountLoading, setAdAccountLoading] = useState(true);

  // Multi-account picker state
  const [allAdAccounts, setAllAdAccounts] = useState<AdAccount[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [savingDefault, setSavingDefault] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);

  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [campaignsLoading, setCampaignsLoading] = useState(false);
  const [campaignsError, setCampaignsError] = useState<string | null>(null);

  const [topPosts, setTopPosts] = useState<TopPost[]>([]);
  const [topPostsLoading, setTopPostsLoading] = useState(false);

  const [connecting, setConnecting] = useState(false);

  // Per-row insights expansion
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // Boost form state (per-post inline)
  const [boostingPostId, setBoostingPostId] = useState<string | null>(null);
  const [boostMode, setBoostMode] = useState<"quick" | "attach">("quick");
  const [boostBudget, setBoostBudget] = useState("10");
  const [boostDuration, setBoostDuration] = useState("7");
  const [boostContinuous, setBoostContinuous] = useState(false);
  const [boostSpecialCategory, setBoostSpecialCategory] = useState("NONE");
  const [boostSaveAsPaused, setBoostSaveAsPaused] = useState(false);

  // Reach estimate state
  interface BoostEstimate {
    estimateReady: boolean;
    dailyImpressionsLower: number | null;
    dailyImpressionsUpper: number | null;
    dailyActionsLower: number | null;
    dailyActionsUpper: number | null;
    audienceSizeLower: number | null;
    audienceSizeUpper: number | null;
  }
  const [estimate, setEstimate] = useState<BoostEstimate | null>(null);
  const [estimateLoading, setEstimateLoading] = useState(false);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [boostCampaignId, setBoostCampaignId] = useState("");
  const [boosting, setBoosting] = useState(false);
  const [boostError, setBoostError] = useState<string | null>(null);
  const [boostSuccess, setBoostSuccess] = useState<string | null>(null);

  // Drill-down: ads under each expanded campaign (campaignId → ads)
  const [adsByCampaign, setAdsByCampaign] = useState<Record<string, MetaAd[]>>({});
  const [loadingAdsForCampaign, setLoadingAdsForCampaign] = useState<string | null>(null);
  // Pause/Activate inflight tracking (entityId → boolean)
  const [statusUpdating, setStatusUpdating] = useState<Record<string, boolean>>({});

  // Already-promoted detection: set of object_story_ids and IG media IDs
  // currently attached to active ads. Used to badge eligible posts.
  const [promotedRefs, setPromotedRefs] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/dashboard/campaigns/ad-accounts");
        const data = await res.json();
        const accounts = (data.accounts || []) as AdAccount[];
        setAllAdAccounts(accounts);
        // Pick the primary if marked, else the first, else null
        const primary = accounts.find((a) => a.isPrimary) || accounts[0] || null;
        setAdAccount(primary);
      } finally {
        setAdAccountLoading(false);
      }
    })();
  }, []);

  async function switchAdAccount(account: AdAccount) {
    setAdAccount(account);
    setPickerOpen(false);
    setExpandedRow(null);
    // Trigger campaigns refetch immediately
    setCampaignsLoading(true);
    setCampaigns([]);
    fetch(`/api/dashboard/campaigns/list?adAccountId=${encodeURIComponent(account.platformAssetId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setCampaignsError(data.message || data.error);
        else setCampaigns(data.campaigns || []);
      })
      .finally(() => setCampaignsLoading(false));
    // Clear ads cache (campaign drill-downs are account-specific)
    setAdsByCampaign({});
  }

  async function refreshAdAccounts() {
    setRefreshing(true);
    setRefreshMessage(null);
    try {
      // Refresh ad accounts via Meta
      const res = await fetch("/api/dashboard/campaigns/refresh-ad-accounts", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setRefreshMessage(data.message || data.error || "Refresh failed");
        return;
      }
      // Refetch the accounts list to pick up any newly-discovered ones
      const listRes = await fetch("/api/dashboard/campaigns/ad-accounts");
      const listData = await listRes.json();
      const accounts = (listData.accounts || []) as AdAccount[];
      const before = allAdAccounts.length;
      setAllAdAccounts(accounts);
      const addedAccounts = accounts.length - before;

      // Also refetch campaigns for the current account — Meta-side
      // edits (new campaigns, status changes, budget tweaks) won't
      // appear without this.
      if (adAccount) {
        const campaignsBefore = campaigns.length;
        await refreshCampaigns();
        // Drop ads cache so drill-downs refetch
        setAdsByCampaign({});
        // After refreshCampaigns, campaigns state may have been updated
        // — check by querying the latest count via a separate fetch
        const cRes = await fetch(`/api/dashboard/campaigns/list?adAccountId=${encodeURIComponent(adAccount.platformAssetId)}`);
        const cData = await cRes.json();
        const newCount = (cData.campaigns || []).length;
        const addedCampaigns = newCount - campaignsBefore;

        const parts: string[] = [];
        if (addedAccounts > 0) parts.push(`${addedAccounts} new ad account${addedAccounts !== 1 ? "s" : ""}`);
        if (addedCampaigns > 0) parts.push(`${addedCampaigns} new campaign${addedCampaigns !== 1 ? "s" : ""}`);
        setRefreshMessage(
          parts.length > 0 ? `Discovered ${parts.join(" + ")}` : "Up to date — nothing new from Meta"
        );
      } else {
        setRefreshMessage(
          addedAccounts > 0
            ? `${addedAccounts} new account${addedAccounts !== 1 ? "s" : ""} discovered`
            : `Up to date — ${data.discovered} accounts accessible`
        );
      }
    } catch (err) {
      setRefreshMessage(err instanceof Error ? err.message : "Network error");
    } finally {
      setRefreshing(false);
    }
  }

  async function setAccountAsDefault(account: AdAccount) {
    setSavingDefault(true);
    try {
      const res = await fetch("/api/dashboard/campaigns/set-default-ad-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platformAssetId: account.platformAssetId }),
      });
      if (res.ok) {
        // Update local state — flip primary flags
        setAllAdAccounts((prev) =>
          prev.map((a) => ({ ...a, isPrimary: a.platformAssetId === account.platformAssetId, isAssigned: a.platformAssetId === account.platformAssetId ? true : a.isAssigned }))
        );
      }
    } finally {
      setSavingDefault(false);
    }
  }

  useEffect(() => {
    if (!adAccount) return;
    setCampaignsLoading(true);
    setCampaignsError(null);
    fetch(`/api/dashboard/campaigns/list?adAccountId=${encodeURIComponent(adAccount.platformAssetId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setCampaignsError(data.message || data.error);
          setCampaigns([]);
        } else {
          setCampaigns(data.campaigns || []);
        }
      })
      .catch((err) => setCampaignsError(err.message || "Network error"))
      .finally(() => setCampaignsLoading(false));
  }, [adAccount]);

  useEffect(() => {
    if (activeTab !== "promote") return;
    setTopPostsLoading(true);
    fetch("/api/dashboard/campaigns/top-posts")
      .then((r) => r.json())
      .then((data) => setTopPosts(data.posts || []))
      .finally(() => setTopPostsLoading(false));

    // Load promoted-refs in parallel so we can badge already-promoted posts
    const adsUrl = adAccount
      ? `/api/dashboard/campaigns/ads?adAccountId=${encodeURIComponent(adAccount.platformAssetId)}`
      : "/api/dashboard/campaigns/ads";
    fetch(adsUrl)
      .then((r) => r.json())
      .then((data) => {
        const refs = new Set<string>();
        for (const ad of (data.ads || []) as MetaAd[]) {
          // Only count ads that aren't deleted/archived as "currently promoted"
          if (ad.effectiveStatus === "DELETED" || ad.effectiveStatus === "ARCHIVED") continue;
          if (ad.objectStoryId) refs.add(ad.objectStoryId);
          if (ad.effectiveInstagramMediaId) refs.add(ad.effectiveInstagramMediaId);
        }
        setPromotedRefs(refs);
      })
      .catch(() => { /* badge is non-critical, fail silently */ });
  }, [activeTab]);

  // Debounced reach estimate fetch — only when Quick Boost is active and budget is valid.
  useEffect(() => {
    if (boostingPostId === null || boostMode !== "quick") {
      setEstimate(null);
      setEstimateError(null);
      return;
    }
    const budget = parseFloat(boostBudget);
    if (!Number.isFinite(budget) || budget < 1) return;
    if (!adAccount) return;

    const handle = setTimeout(() => {
      setEstimateLoading(true);
      setEstimateError(null);
      fetch("/api/dashboard/campaigns/boost-estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dailyBudgetDollars: budget, adAccountId: adAccount.platformAssetId }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.error) {
            setEstimateError(data.message || data.error);
            setEstimate(null);
          } else {
            setEstimate(data);
          }
        })
        .catch((err) => setEstimateError(err.message || "Estimate failed"))
        .finally(() => setEstimateLoading(false));
    }, 400);

    return () => clearTimeout(handle);
  }, [boostingPostId, boostMode, boostBudget, adAccount]);

  async function setStatus(entityId: string, status: "ACTIVE" | "PAUSED") {
    setStatusUpdating((prev) => ({ ...prev, [entityId]: true }));
    try {
      const res = await fetch("/api/dashboard/campaigns/set-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityId, status }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || data.error || "Status update failed");
      }
      // Refresh affected data
      await refreshCampaigns();
      setAdsByCampaign({});  // invalidate ads cache so drill-downs refetch
    } catch (err) {
      // Surface error briefly via the refresh-message banner
      setRefreshMessage(err instanceof Error ? err.message : "Status update failed");
    } finally {
      setStatusUpdating((prev) => {
        const copy = { ...prev };
        delete copy[entityId];
        return copy;
      });
    }
  }

  async function loadAdsForCampaign(campaignId: string) {
    if (adsByCampaign[campaignId]) return; // already loaded
    setLoadingAdsForCampaign(campaignId);
    try {
      const accountParam = adAccount ? `&adAccountId=${encodeURIComponent(adAccount.platformAssetId)}` : "";
      const res = await fetch(`/api/dashboard/campaigns/ads?campaignId=${encodeURIComponent(campaignId)}${accountParam}`);
      const data = await res.json();
      if (Array.isArray(data.ads)) {
        setAdsByCampaign((prev) => ({ ...prev, [campaignId]: data.ads }));
      }
    } finally {
      setLoadingAdsForCampaign(null);
    }
  }

  async function refreshCampaigns() {
    setCampaignsLoading(true);
    try {
      const url = adAccount
        ? `/api/dashboard/campaigns/list?adAccountId=${encodeURIComponent(adAccount.platformAssetId)}`
        : "/api/dashboard/campaigns/list";
      const res = await fetch(url);
      const data = await res.json();
      if (data.error) {
        setCampaignsError(data.message || data.error);
        setCampaigns([]);
      } else {
        setCampaigns(data.campaigns || []);
      }
    } finally {
      setCampaignsLoading(false);
    }
  }

  async function submitBoost(post: TopPost) {
    setBoosting(true);
    setBoostError(null);
    setBoostSuccess(null);
    try {
      const res = await fetch("/api/dashboard/campaigns/boost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: post.platform,
          // FB fields (null for IG posts; backend handles per-platform validation)
          postId: post.platform === "facebook" ? post.id : "",
          pageId: post.pageId ?? "",
          pageName: post.pageName ?? "",
          // IG fields
          igMediaId: post.igMediaId ?? "",
          igUserId: post.igUserId ?? "",
          igUsername: post.igUsername ?? "",
          name: `Boost: ${post.caption.slice(0, 50) || post.id}`,
          dailyBudgetDollars: parseFloat(boostBudget),
          adAccountId: adAccount?.platformAssetId,
          // Mode-specific fields
          quickBoost: boostMode === "quick",
          campaignId: boostMode === "attach" ? (boostCampaignId || undefined) : undefined,
          // Quick Boost extras
          durationDays: boostMode === "quick" ? parseInt(boostDuration, 10) : undefined,
          runContinuously: boostMode === "quick" ? boostContinuous : undefined,
          specialAdCategories: boostMode === "quick" && boostSpecialCategory !== "NONE"
            ? [boostSpecialCategory]
            : [],
          status: boostMode === "quick" && boostSaveAsPaused ? "PAUSED" : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBoostError(data.message || data.error || "Boost failed");
        return;
      }
      setBoostSuccess(
        boostCampaignId
          ? `Promoted post added to existing campaign (paused). Activate in Meta Ads Manager when ready.`
          : `New boost campaign created (paused). Activate in Meta Ads Manager when ready.`
      );
      setBoostingPostId(null);
      setBoostCampaignId("");
      // Pull the campaigns list so the new boost appears
      await refreshCampaigns();
      // Invalidate ads cache for the affected campaign so drill-down refreshes
      if (data.campaignId) {
        setAdsByCampaign((prev) => {
          const copy = { ...prev };
          delete copy[data.campaignId];
          return copy;
        });
      }
    } catch (err) {
      setBoostError(err instanceof Error ? err.message : "Network error");
    } finally {
      setBoosting(false);
    }
  }

  async function startConnectFlow() {
    setConnecting(true);
    try {
      const res = await fetch("/api/auth/meta-ads");
      const data = await res.json();
      if (data.auth_url) {
        window.location.href = data.auth_url as string;
      } else {
        setConnecting(false);
      }
    } catch {
      setConnecting(false);
    }
  }

  // ── No ad account connected: surface the connect CTA ──────────────────
  if (!adAccountLoading && !adAccount) {
    return (
      <div className="p-4">
        <div className="mb-4">
          <h2 className="text-lg font-medium">Promote on Meta</h2>
          <p className="text-xs text-muted">Cross-promote your best organic content into your existing Meta campaigns</p>
        </div>

        <div className="rounded-xl border border-border bg-surface p-6 shadow-card">
          <h3 className="text-base font-medium mb-2">Authorize Ad Management</h3>
          <p className="text-sm text-muted mb-4 leading-relaxed">
            To create and manage paid campaigns, TracPost needs permission to access your Meta Ad Account.
            Your ad account, your spend, your billing — TracPost only operates within your account, never owns it,
            and never holds funds. Every campaign created here remains visible in your own Meta Ads Manager.
          </p>
          <ul className="text-xs text-muted space-y-1 mb-5 ml-4 list-disc">
            <li>Campaigns are created using the Meta Marketing API on your behalf</li>
            <li>Meta charges your existing payment method directly</li>
            <li>You can revoke TracPost&apos;s access at any time from your Meta Business settings</li>
          </ul>
          <button
            onClick={startConnectFlow}
            disabled={connecting}
            className="rounded bg-accent px-5 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
          >
            {connecting ? "Redirecting…" : "Authorize Ad Management"}
          </button>
        </div>
      </div>
    );
  }

  // ── Loading initial state ─────────────────────────────────────────────
  if (adAccountLoading || !adAccount) {
    return (
      <div className="p-4">
        <p className="text-sm text-muted">Loading…</p>
      </div>
    );
  }

  // ── Connected: render campaigns + boost surface ───────────────────────
  const totalSpend = campaigns.reduce((sum, c) => sum + parseFloat(c.insights.spend || "0"), 0);
  const totalImpressions = campaigns.reduce((sum, c) => sum + parseInt(c.insights.impressions || "0", 10), 0);
  const activeCount = campaigns.filter((c) => c.effectiveStatus === "ACTIVE").length;

  return (
    <div className="p-4">
      {/* Ad Account header — picker dropdown + prominent refresh */}
      {refreshMessage && (
        <div className="mb-3 rounded bg-accent/5 border border-accent/20 px-3 py-1.5 text-xs text-muted">
          {refreshMessage}
        </div>
      )}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium">Promote on Meta</h2>
          <p className="text-xs text-muted">
            TracPost reads from Meta — changes you make in Meta Ads Manager won&apos;t appear here until you refresh.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refreshAdAccounts}
            disabled={refreshing}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs hover:border-accent/40 transition-colors disabled:opacity-50"
            title="Re-discover ad accounts and reload campaigns from Meta"
          >
            <span className={refreshing ? "animate-spin inline-block" : "inline-block"}>↻</span>
            <span>{refreshing ? "Refreshing…" : "Refresh from Meta"}</span>
          </button>
          {adAccount && (
            <a
              href={metaAdsManagerUrl(adAccount.id)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs hover:border-accent/40 transition-colors"
              title="Open this ad account in Meta Ads Manager"
            >
              Meta Ads Manager ↗
            </a>
          )}
        <div className="relative">
          <button
            onClick={() => setPickerOpen((v) => !v)}
            className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-2 hover:border-accent/40 transition-colors"
          >
            <div className="text-left">
              <p className="text-[10px] text-muted">Ad Account {adAccount.isPrimary && "· default"}</p>
              <p className="text-sm font-medium">{adAccount.name}</p>
            </div>
            <div className="h-8 w-px bg-border" />
            <div className="text-left">
              <p className="text-[10px] text-muted">Lifetime Spent</p>
              <p className="text-sm font-medium">{fmtMoney(adAccount.amountSpent, adAccount.currency)}</p>
            </div>
            <span className={`h-2 w-2 rounded-full ${statusDotColor(adAccount.status)}`} />
            {allAdAccounts.length > 1 && (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`transition-transform ${pickerOpen ? "rotate-180" : ""}`}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            )}
          </button>

          {pickerOpen && allAdAccounts.length > 0 && (
            <div className="absolute right-0 top-full z-50 mt-1 w-96 rounded-lg border border-border bg-surface shadow-xl">
              <div className="border-b border-border px-3 py-2">
                <p className="text-[10px] text-muted uppercase tracking-wide">Ad Accounts</p>
              </div>
              <div className="max-h-96 overflow-y-auto">
                {allAdAccounts.map((acct) => {
                  const isCurrent = acct.platformAssetId === adAccount.platformAssetId;
                  const statusLabel = acct.status !== null ? STATUS_LABELS[acct.status] || `Status ${acct.status}` : "—";
                  return (
                    <div
                      key={acct.platformAssetId}
                      className={`flex items-start gap-3 border-b border-border last:border-0 px-3 py-3 transition-colors ${
                        isCurrent ? "bg-accent/5" : "hover:bg-surface-hover"
                      }`}
                    >
                      <button
                        onClick={() => switchAdAccount(acct)}
                        className="flex-1 text-left"
                      >
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${statusDotColor(acct.status)}`} />
                          <span className="text-sm font-medium">{acct.name}</span>
                          {isCurrent && (
                            <span className="rounded-full bg-accent/10 px-1.5 py-0.5 text-[9px] font-medium text-accent">selected</span>
                          )}
                          {acct.isPrimary && (
                            <span className="rounded-full bg-success/10 px-1.5 py-0.5 text-[9px] font-medium text-success">default</span>
                          )}
                        </div>
                        <div className="flex gap-3 text-[10px] text-muted">
                          <span>{acct.id}</span>
                          <span>·</span>
                          <span>{statusLabel}</span>
                          <span>·</span>
                          <span>{acct.currency}</span>
                          <span>·</span>
                          <span>{fmtMoney(acct.amountSpent, acct.currency)} lifetime</span>
                        </div>
                      </button>
                      {!acct.isPrimary && (
                        <button
                          onClick={() => setAccountAsDefault(acct)}
                          disabled={savingDefault}
                          className="text-[10px] text-muted hover:text-accent disabled:opacity-50 whitespace-nowrap"
                        >
                          Set as default
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="border-t border-border px-3 py-2">
                <p className="text-[10px] text-muted">{allAdAccounts.length} account{allAdAccounts.length !== 1 ? "s" : ""} accessible to your Meta authorization.</p>
              </div>
            </div>
          )}
        </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-1 border-b border-border">
        <button
          onClick={() => setActiveTab("campaigns")}
          className={`px-4 py-2.5 text-sm transition-colors ${
            activeTab === "campaigns" ? "border-b-2 border-accent text-accent" : "text-muted hover:text-foreground"
          }`}
        >
          Campaigns
        </button>
        <button
          onClick={() => setActiveTab("promote")}
          className={`px-4 py-2.5 text-sm transition-colors ${
            activeTab === "promote" ? "border-b-2 border-accent text-accent" : "text-muted hover:text-foreground"
          }`}
        >
          Promote a Post
        </button>
      </div>

      {/* Campaigns Tab */}
      {activeTab === "campaigns" && (
        <div className="space-y-3">
          <p className="text-xs text-muted">
            Campaigns and audience structure are set up in <a href="https://business.facebook.com/adsmanager" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Meta Ads Manager</a>. TracPost surfaces them here for monitoring and lets you promote your top organic posts into existing campaigns from the <button onClick={() => setActiveTab("promote")} className="text-accent hover:underline">Promote a Post</button> tab.
          </p>

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-border bg-surface p-3 shadow-card">
              <p className="text-2xl font-semibold">{activeCount}</p>
              <p className="text-xs text-muted">Active campaigns</p>
            </div>
            <div className="rounded-xl border border-border bg-surface p-3 shadow-card">
              <p className="text-2xl font-semibold">{fmtMoney(totalSpend.toString(), adAccount.currency)}</p>
              <p className="text-xs text-muted">Lifetime spend</p>
            </div>
            <div className="rounded-xl border border-border bg-surface p-3 shadow-card">
              <p className="text-2xl font-semibold">{totalImpressions.toLocaleString()}</p>
              <p className="text-xs text-muted">Lifetime impressions</p>
            </div>
          </div>

          {campaignsLoading && (
            <p className="text-sm text-muted">Loading campaigns…</p>
          )}
          {campaignsError && (
            <div className="rounded-xl border border-danger/40 bg-danger/5 p-3 text-xs text-danger">
              Could not load campaigns: {campaignsError}
            </div>
          )}
          {!campaignsLoading && !campaignsError && campaigns.length === 0 && (
            <div className="rounded-xl border border-border bg-surface p-6 text-center shadow-card">
              <p className="text-sm font-medium mb-1">No campaigns yet</p>
              <p className="text-xs text-muted mb-3">When you create your first campaign, it will appear here with live performance data.</p>
              <p className="text-[11px] text-muted">Campaign creation will be available soon.</p>
            </div>
          )}
          {!campaignsLoading && campaigns.length > 0 && (
            <div className="space-y-2">
              {campaigns.map((c) => {
                const isExpanded = expandedRow === c.id;
                const adsForThisCampaign = adsByCampaign[c.id];
                const targetingSummary = humanizeTargeting(c.firstAdSetTargeting);
                const daysLeft = daysRemaining(c.stopTime);
                return (
                  <div key={c.id} className="rounded-xl border border-border bg-surface shadow-card">
                    <button
                      onClick={() => {
                        const next = isExpanded ? null : c.id;
                        setExpandedRow(next);
                        if (next) loadAdsForCampaign(next);
                      }}
                      className="w-full px-4 py-3 hover:bg-surface-hover transition-colors text-left rounded-xl"
                    >
                      {/* Top row: title + status badges */}
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-start gap-2 min-w-0 flex-1">
                          <PlatformIcon platform="facebook" size={16} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-medium truncate">{c.name || c.id}</p>
                              {c.specialAdCategories.length > 0 && (
                                <span className="rounded-full bg-warning/10 px-1.5 py-0.5 text-[9px] font-medium text-warning">
                                  {c.specialAdCategories.join(" · ")}
                                </span>
                              )}
                              {(c.dailyBudget || c.lifetimeBudget) && (
                                <span className="rounded-full bg-accent/10 px-1.5 py-0.5 text-[9px] font-medium text-accent" title="Campaign Budget Optimization — budget is set at campaign level and shared across ad sets">
                                  CBO
                                </span>
                              )}
                              {isLegacyObjective(c.objective) && (
                                <span className="rounded-full bg-muted/20 px-1.5 py-0.5 text-[9px] font-medium text-muted" title="Legacy objective — Meta no longer accepts new ads against this campaign">
                                  legacy
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-muted mt-0.5">{objectiveLabel(c.objective)} · started {fmtDate(c.startTime || c.createdTime)}</p>
                          </div>
                        </div>
                        <span className={`rounded-full px-2 py-0.5 text-[9px] font-medium shrink-0 ${STATUS_COLORS[c.effectiveStatus] || "bg-gray-100 text-gray-500"}`}>
                          {c.effectiveStatus.toLowerCase()}
                        </span>
                      </div>

                      {/* Middle row: scope info — ad count, end date, targeting */}
                      <div className="flex items-center gap-3 text-[10px] text-muted mb-2 flex-wrap">
                        {typeof c.adCount === "number" && (
                          <span>{c.adCount} ad{c.adCount !== 1 ? "s" : ""}</span>
                        )}
                        {daysLeft !== null && (
                          <>
                            <span>·</span>
                            <span>{daysLeft === 0 ? "ends today" : `${daysLeft} day${daysLeft !== 1 ? "s" : ""} left`}</span>
                          </>
                        )}
                        {targetingSummary && (
                          <>
                            <span>·</span>
                            <span className="truncate">{targetingSummary}</span>
                          </>
                        )}
                      </div>

                      {/* Bottom row: metrics */}
                      <div className="grid grid-cols-4 gap-3">
                        <div>
                          <p className="text-[9px] text-muted">Budget</p>
                          <p className="text-xs font-medium">
                            {c.dailyBudget ? fmtBudgetCents(c.dailyBudget) : c.lifetimeBudget ? `$${(parseInt(c.lifetimeBudget, 10) / 100).toFixed(2)} lifetime` : "—"}
                          </p>
                          {c.budgetRemaining && c.lifetimeBudget && (
                            <p className="text-[9px] text-muted">${(parseInt(c.budgetRemaining, 10) / 100).toFixed(2)} left</p>
                          )}
                        </div>
                        <div>
                          <p className="text-[9px] text-muted">Spent</p>
                          <p className="text-xs font-medium">{fmtMoney(c.insights.spend, adAccount.currency)}</p>
                        </div>
                        <div>
                          <p className="text-[9px] text-muted">Reach</p>
                          <p className="text-xs font-medium">{parseInt(c.insights.reach || "0", 10).toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-[9px] text-muted">Clicks</p>
                          <p className="text-xs font-medium">{parseInt(c.insights.clicks || "0", 10).toLocaleString()}</p>
                        </div>
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="border-t border-border bg-background px-4 py-3 space-y-4">
                        {/* Campaign-level rollup metrics */}
                        <div className="grid grid-cols-4 gap-4">
                          <div>
                            <p className="text-[10px] text-muted">Impressions</p>
                            <p className="text-sm font-medium">{parseInt(c.insights.impressions || "0", 10).toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-muted">CTR</p>
                            <p className="text-sm font-medium">{parseFloat(c.insights.ctr || "0").toFixed(2)}%</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-muted">CPC</p>
                            <p className="text-sm font-medium">{fmtMoney(c.insights.cpc, adAccount.currency)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-muted">CPM</p>
                            <p className="text-sm font-medium">{fmtMoney(c.insights.cpm, adAccount.currency)}</p>
                          </div>
                        </div>

                        {/* Per-ad detail (promoted posts inside this campaign) */}
                        <div>
                          <h4 className="text-[11px] font-medium text-muted mb-2">Promoted posts in this campaign</h4>
                          {loadingAdsForCampaign === c.id && (
                            <p className="text-[11px] text-muted">Loading ads…</p>
                          )}
                          {adsForThisCampaign && adsForThisCampaign.length === 0 && (
                            <p className="text-[11px] text-muted">No ads in this campaign yet. Use the Promote a Post tab to add one.</p>
                          )}
                          {adsForThisCampaign && adsForThisCampaign.length > 0 && (
                            <div className="space-y-2">
                              {adsForThisCampaign.map((ad) => (
                                <div key={ad.id} className="flex items-start gap-3 rounded border border-border bg-surface p-2">
                                  {ad.thumbnailUrl && (
                                    <img src={ad.thumbnailUrl} alt="" className="h-10 w-10 rounded object-cover flex-shrink-0" />
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium truncate">{ad.name || ad.id}</p>
                                    <p className="text-[10px] text-muted">
                                      {ad.objectStoryId ? `FB post · ${ad.objectStoryId}` : ad.effectiveInstagramMediaId ? `IG media · ${ad.effectiveInstagramMediaId}` : "no creative ref"}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-3 text-[10px]">
                                    <span className={`rounded-full px-2 py-0.5 font-medium ${STATUS_COLORS[ad.effectiveStatus] || "bg-gray-100 text-gray-500"}`}>
                                      {ad.effectiveStatus.toLowerCase()}
                                    </span>
                                    <span>{fmtMoney(ad.insights.spend, adAccount.currency)} spent</span>
                                    <span>{parseInt(ad.insights.impressions || "0", 10).toLocaleString()} impressions</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center justify-between pt-1 border-t border-border">
                          <p className="text-[10px] text-muted">
                            Campaign ID: {c.id} · Status: {c.status} · Created {fmtDate(c.createdTime)}
                          </p>
                          <div className="flex items-center gap-2">
                            {c.status === "ACTIVE" ? (
                              <button
                                onClick={(e) => { e.stopPropagation(); setStatus(c.id, "PAUSED"); }}
                                disabled={statusUpdating[c.id]}
                                className="rounded border border-border px-2.5 py-1 text-[10px] font-medium text-muted hover:bg-warning/10 hover:text-warning hover:border-warning/40 disabled:opacity-50"
                              >
                                {statusUpdating[c.id] ? "…" : "Pause"}
                              </button>
                            ) : (
                              <button
                                onClick={(e) => { e.stopPropagation(); setStatus(c.id, "ACTIVE"); }}
                                disabled={statusUpdating[c.id]}
                                className="rounded border border-border px-2.5 py-1 text-[10px] font-medium text-muted hover:bg-success/10 hover:text-success hover:border-success/40 disabled:opacity-50"
                              >
                                {statusUpdating[c.id] ? "…" : "Activate"}
                              </button>
                            )}
                            {adAccount && (
                              <a
                                href={metaAdsManagerUrl(adAccount.id, c.id)}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="rounded border border-border px-2.5 py-1 text-[10px] font-medium text-muted hover:bg-accent/10 hover:text-accent hover:border-accent/40"
                              >
                                Open in Meta ↗
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Promote a Post Tab — eligible posts ranked by engagement, with badges
          on posts already attached to active boost campaigns. */}
      {activeTab === "promote" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
            <h3 className="text-sm font-medium mb-1">Top Performing Organic Posts</h3>
            <p className="text-xs text-muted mb-4">
              These are your highest-engagement posts. Boosting amplifies content your audience has already validated.
            </p>

            {topPostsLoading && <p className="text-sm text-muted">Loading…</p>}
            {!topPostsLoading && topPosts.length === 0 && (
              <p className="text-xs text-muted">
                No organic posts available yet. Once you publish to a connected Facebook Page, posts will appear here ranked by engagement.
              </p>
            )}

            {boostSuccess && (
              <div className="mb-3 rounded bg-success/10 px-3 py-2 text-xs text-success">
                {boostSuccess}
              </div>
            )}

            <div className="space-y-3">
              {topPosts.map((post) => {
                const isBoosting = boostingPostId === post.id;
                // A post is already-promoted if its identifier appears
                // in any active ad's creative reference.
                // FB: post.id is in pageId_postId form (matches object_story_id)
                // IG: post.igMediaId matches effective_instagram_media_id
                const ref = post.platform === "instagram" ? (post.igMediaId || "") : post.id;
                const alreadyPromoted = promotedRefs.has(ref);
                return (
                  <div
                    key={post.id}
                    className={`rounded-lg border p-3 transition-colors ${
                      isBoosting ? "border-accent bg-accent/5" : "border-border hover:border-accent/50"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {post.image && (
                        <img src={post.image} alt="" className="h-16 w-16 rounded object-cover flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <PlatformIcon platform={post.platform} size={14} />
                          <span className="text-[10px] text-muted">
                            {post.platform === "instagram" ? `@${post.igUsername}` : post.pageName}
                          </span>
                          {alreadyPromoted && (
                            <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[9px] font-medium text-accent">
                              Currently promoted
                            </span>
                          )}
                        </div>
                        <p className="text-xs line-clamp-2">{post.caption || "(no caption)"}</p>
                        <div className="mt-1.5 flex gap-4 text-[10px] text-muted">
                          <span>{post.engagement.toLocaleString()} engagements</span>
                          <span>{fmtDate(post.createdTime)}</span>
                        </div>
                      </div>
                      {!isBoosting && (
                        <button
                          onClick={() => {
                            setBoostingPostId(post.id);
                            setBoostError(null);
                            setBoostSuccess(null);
                            setBoostCampaignId("");
                          }}
                          className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90"
                        >
                          {alreadyPromoted ? "Promote again" : "Promote"}
                        </button>
                      )}
                    </div>

                    {isBoosting && (
                      <div className="mt-3 pt-3 border-t border-border space-y-3">
                        {/* Mode selector */}
                        <div className="flex gap-1 border-b border-border">
                          <button
                            onClick={() => setBoostMode("quick")}
                            className={`px-3 py-1.5 text-[11px] transition-colors ${
                              boostMode === "quick" ? "border-b-2 border-accent text-accent font-medium" : "text-muted hover:text-foreground"
                            }`}
                          >
                            Quick Boost (recommended)
                          </button>
                          <button
                            onClick={() => setBoostMode("attach")}
                            className={`px-3 py-1.5 text-[11px] transition-colors ${
                              boostMode === "attach" ? "border-b-2 border-accent text-accent font-medium" : "text-muted hover:text-foreground"
                            }`}
                          >
                            Attach to existing campaign
                          </button>
                        </div>

                        {boostMode === "quick" && (
                          <div className="space-y-2">
                            <p className="text-[10px] text-muted leading-relaxed">
                              Creates a fresh campaign with Meta&apos;s Advantage+ defaults — smart audience, smart placements, optimized for engagement. Mirrors Facebook&apos;s native &quot;Boost post&quot; button.
                            </p>
                            <div className="grid grid-cols-[140px_1fr_180px] gap-3">
                              <div>
                                <label className="block text-[10px] text-muted mb-0.5">Daily Budget ($)</label>
                                <input
                                  type="number"
                                  min="2"
                                  step="1"
                                  value={boostBudget}
                                  onChange={(e) => setBoostBudget(e.target.value)}
                                  className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] text-muted mb-0.5">Duration</label>
                                {boostContinuous ? (
                                  <p className="text-xs py-1.5">Runs until manually paused</p>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="number"
                                      min="1"
                                      max="90"
                                      step="1"
                                      value={boostDuration}
                                      onChange={(e) => setBoostDuration(e.target.value)}
                                      className="w-16 rounded border border-border bg-background px-2 py-1.5 text-xs"
                                    />
                                    <span className="text-xs text-muted">days</span>
                                  </div>
                                )}
                                <label className="mt-1 inline-flex items-center gap-1.5 text-[10px] text-muted cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={boostContinuous}
                                    onChange={(e) => setBoostContinuous(e.target.checked)}
                                    className="h-3 w-3"
                                  />
                                  Run continuously
                                </label>
                              </div>
                              <div>
                                <label className="block text-[10px] text-muted mb-0.5">Special Ad Category</label>
                                <select
                                  value={boostSpecialCategory}
                                  onChange={(e) => setBoostSpecialCategory(e.target.value)}
                                  className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs"
                                >
                                  <option value="NONE">None</option>
                                  <option value="HOUSING">Housing</option>
                                  <option value="EMPLOYMENT">Employment</option>
                                  <option value="CREDIT">Credit</option>
                                  <option value="ISSUES_ELECTIONS_POLITICS">Politics / Issues</option>
                                </select>
                              </div>
                            </div>
                            {/* Live reach estimate from Marketing API */}
                            <div className="rounded-lg border border-accent/20 bg-accent/5 p-3">
                              {estimateLoading && (
                                <p className="text-[11px] text-muted">Estimating reach…</p>
                              )}
                              {!estimateLoading && estimateError && (
                                <p className="text-[11px] text-muted">Estimate unavailable: {estimateError}</p>
                              )}
                              {!estimateLoading && !estimateError && estimate && estimate.estimateReady && (
                                <div className="space-y-0.5">
                                  <p className="text-[11px] text-muted">Audience reach</p>
                                  {estimate.audienceSizeLower !== null && estimate.audienceSizeUpper !== null && (
                                    <p className="text-xs">
                                      <span className="font-medium text-foreground">
                                        {(estimate.audienceSizeLower / 1_000_000).toFixed(0)}M – {(estimate.audienceSizeUpper / 1_000_000).toFixed(0)}M
                                      </span>
                                      <span className="text-muted"> people in your targeting</span>
                                    </p>
                                  )}
                                  {estimate.dailyImpressionsLower !== null && estimate.dailyImpressionsLower > 0 && (
                                    <p className="text-xs">
                                      ~<span className="font-medium text-foreground">{estimate.dailyImpressionsLower.toLocaleString()}</span>
                                      {estimate.dailyImpressionsUpper && estimate.dailyImpressionsUpper !== estimate.dailyImpressionsLower && (
                                        <> – <span className="font-medium text-foreground">{estimate.dailyImpressionsUpper.toLocaleString()}</span></>
                                      )}
                                      <span className="text-muted"> daily impressions</span>
                                    </p>
                                  )}
                                  {estimate.dailyActionsLower !== null && estimate.dailyActionsLower > 0 && (
                                    <p className="text-xs">
                                      ~<span className="font-medium text-foreground">{estimate.dailyActionsLower.toLocaleString()}</span>
                                      <span className="text-muted"> daily engagements</span>
                                    </p>
                                  )}
                                  {(() => {
                                    const days = boostContinuous ? null : parseInt(boostDuration, 10);
                                    const daily = parseFloat(boostBudget);
                                    if (!days || !Number.isFinite(daily)) return null;
                                    const total = days * daily;
                                    return (
                                      <p className="text-[10px] text-muted pt-1">
                                        Total over {days} day{days !== 1 ? "s" : ""}: <span className="text-foreground font-medium">${total.toFixed(2)}</span>
                                      </p>
                                    );
                                  })()}
                                </div>
                              )}
                              {!estimateLoading && !estimateError && (!estimate || !estimate.estimateReady) && (
                                <p className="text-[11px] text-muted">Adjust budget to see predicted reach</p>
                              )}
                            </div>

                            <label className="inline-flex items-center gap-1.5 text-[10px] text-muted cursor-pointer">
                              <input
                                type="checkbox"
                                checked={boostSaveAsPaused}
                                onChange={(e) => setBoostSaveAsPaused(e.target.checked)}
                                className="h-3 w-3"
                              />
                              Save as paused (don&apos;t activate yet — proof in Meta Ads Manager first)
                            </label>
                          </div>
                        )}

                        {boostMode === "attach" && campaigns.length === 0 && (
                          <div className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-xs">
                            <p className="font-medium mb-1">No campaigns yet in this ad account</p>
                            <p className="text-muted leading-relaxed mb-2">
                              No existing campaigns to attach to. Either switch to <button onClick={() => setBoostMode("quick")} className="text-accent hover:underline">Quick Boost</button> above, or create a campaign in Meta Ads Manager first.
                            </p>
                            {adAccount && (
                              <a
                                href={metaAdsManagerUrl(adAccount.id)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center text-xs font-medium text-accent hover:underline"
                              >
                                Open Meta Ads Manager →
                              </a>
                            )}
                          </div>
                        )}

                        {boostMode === "attach" && campaigns.length > 0 && (
                        <>
                        {(() => {
                          const selectedCampaign = boostCampaignId ? campaigns.find((x) => x.id === boostCampaignId) : null;
                          const usesCBO = !!(selectedCampaign?.dailyBudget || selectedCampaign?.lifetimeBudget);
                          return (
                            <>
                              <div className={usesCBO ? "" : "grid grid-cols-[1fr_140px] gap-3"}>
                                <div>
                                  <label className="block text-[10px] text-muted mb-0.5">Attach to Campaign</label>
                                  <select
                                    value={boostCampaignId}
                                    onChange={(e) => setBoostCampaignId(e.target.value)}
                                    className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs"
                                  >
                                    <option value="">— Select a campaign —</option>
                                    {campaigns.map((c) => {
                                      const legacy = isLegacyObjective(c.objective);
                                      const cboBudget = c.dailyBudget
                                        ? `· CBO $${(parseInt(c.dailyBudget, 10) / 100).toFixed(2)}/day`
                                        : c.lifetimeBudget
                                        ? `· CBO $${(parseInt(c.lifetimeBudget, 10) / 100).toFixed(2)} lifetime`
                                        : "· ad-set budget";
                                      return (
                                        <option key={c.id} value={c.id} disabled={legacy}>
                                          {c.name || c.id} · {objectiveLabel(c.objective)} {cboBudget} ({c.effectiveStatus.toLowerCase()}){legacy ? " — legacy, can't add ads" : ""}
                                        </option>
                                      );
                                    })}
                                  </select>
                                  {selectedCampaign && adAccount && (
                                    <p className="mt-1 text-[10px] text-muted">
                                      Inheriting <span className="text-foreground">{objectiveLabel(selectedCampaign.objective)}</span> objective + audience targeting from this campaign. <a href={metaAdsManagerUrl(adAccount.id, selectedCampaign.id)} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Edit in Meta Ads Manager →</a>
                                    </p>
                                  )}
                                  {usesCBO && selectedCampaign && (
                                    <p className="mt-1 text-[10px] text-accent">
                                      Campaign Budget Optimization: this campaign controls budget at the campaign level
                                      {selectedCampaign.dailyBudget && ` ($${(parseInt(selectedCampaign.dailyBudget, 10) / 100).toFixed(2)}/day)`}
                                      . Your boost shares it with other ad sets in this campaign.
                                    </p>
                                  )}
                                  {campaigns.length > 0 && campaigns.every((c) => isLegacyObjective(c.objective)) && (
                                    <p className="mt-1 text-[10px] text-warning leading-relaxed">
                                      All campaigns in this account use legacy objectives. Meta no longer accepts new ads against these. Create a new campaign in <a href={adAccount ? metaAdsManagerUrl(adAccount.id) : "#"} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Meta Ads Manager</a> with a current objective (Traffic, Engagement, Leads, Awareness, or Sales) to enable boosts.
                                    </p>
                                  )}
                                </div>
                                {!usesCBO && (
                                  <div>
                                    <label className="block text-[10px] text-muted mb-0.5">Daily Budget ($)</label>
                                    <input
                                      type="number"
                                      min="1"
                                      step="1"
                                      value={boostBudget}
                                      onChange={(e) => setBoostBudget(e.target.value)}
                                      className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs"
                                    />
                                  </div>
                                )}
                              </div>
                            </>
                          );
                        })()}
                        </>
                        )}

                        {/* Submit / cancel — shared across both modes */}
                        <div className="flex items-center justify-end gap-2 pt-1">
                            <button
                              onClick={() => { setBoostingPostId(null); setBoostCampaignId(""); }}
                              className="rounded border border-border px-3 py-1.5 text-xs text-muted hover:bg-surface-hover"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => submitBoost(post)}
                              disabled={boosting || (boostMode === "attach" && !boostCampaignId) || (boostMode === "attach" && campaigns.length === 0)}
                              className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-50"
                            >
                              {boosting
                                ? "Creating…"
                                : boostMode === "quick"
                                ? boostSaveAsPaused
                                  ? "Save as Paused"
                                  : "Boost Now (Active)"
                                : "Add to Campaign (Paused)"}
                            </button>
                        </div>
                        {boostError && (
                          <p className="text-xs text-danger">{boostError}</p>
                        )}
                        <p className="text-[10px] text-muted">
                          Boost is created in PAUSED status — activate in Meta Ads Manager when you&apos;re ready to spend.
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
