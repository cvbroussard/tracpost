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
}

interface CampaignRow {
  id: string;
  name: string;
  objective: string;
  status: string;
  effectiveStatus: string;
  dailyBudget: string | null;
  lifetimeBudget: string | null;
  createdTime: string;
  startTime: string | null;
  stopTime: string | null;
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

  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [campaignsLoading, setCampaignsLoading] = useState(false);
  const [campaignsError, setCampaignsError] = useState<string | null>(null);

  const [topPosts, setTopPosts] = useState<TopPost[]>([]);
  const [topPostsLoading, setTopPostsLoading] = useState(false);

  const [connecting, setConnecting] = useState(false);

  // Campaign creation form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newObjective, setNewObjective] = useState("OUTCOME_TRAFFIC");
  const [newBudget, setNewBudget] = useState("10");

  // Per-row insights expansion
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // Boost form state (per-post inline)
  const [boostingPostId, setBoostingPostId] = useState<string | null>(null);
  const [boostBudget, setBoostBudget] = useState("10");
  // Optional: attach this boost to an existing campaign.
  // "" = create a new campaign for this boost.
  const [boostCampaignId, setBoostCampaignId] = useState("");
  const [boosting, setBoosting] = useState(false);
  const [boostError, setBoostError] = useState<string | null>(null);
  const [boostSuccess, setBoostSuccess] = useState<string | null>(null);

  // Drill-down: ads under each expanded campaign (campaignId → ads)
  const [adsByCampaign, setAdsByCampaign] = useState<Record<string, MetaAd[]>>({});
  const [loadingAdsForCampaign, setLoadingAdsForCampaign] = useState<string | null>(null);

  // Already-promoted detection: set of object_story_ids and IG media IDs
  // currently attached to active ads. Used to badge eligible posts.
  const [promotedRefs, setPromotedRefs] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/dashboard/campaigns/ad-account");
        const data = await res.json();
        if (data.connected) {
          setAdAccount(data.adAccount);
        } else {
          setAdAccount(null);
        }
      } finally {
        setAdAccountLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!adAccount) return;
    setCampaignsLoading(true);
    setCampaignsError(null);
    fetch("/api/dashboard/campaigns/list")
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
    fetch("/api/dashboard/campaigns/ads")
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

  async function loadAdsForCampaign(campaignId: string) {
    if (adsByCampaign[campaignId]) return; // already loaded
    setLoadingAdsForCampaign(campaignId);
    try {
      const res = await fetch(`/api/dashboard/campaigns/ads?campaignId=${encodeURIComponent(campaignId)}`);
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
      const res = await fetch("/api/dashboard/campaigns/list");
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

  async function submitNewCampaign() {
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/dashboard/campaigns/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          objective: newObjective,
          dailyBudgetDollars: parseFloat(newBudget),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCreateError(data.message || data.error || "Create failed");
        return;
      }
      // Reset form and refresh list
      setShowCreateForm(false);
      setNewName("");
      setNewBudget("10");
      setNewObjective("OUTCOME_TRAFFIC");
      await refreshCampaigns();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Network error");
    } finally {
      setCreating(false);
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
          campaignId: boostCampaignId || undefined,
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
          <h2 className="text-lg font-medium">Meta Ads</h2>
          <p className="text-xs text-muted">Promote your best content to homeowners in your service area</p>
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
      {/* Ad Account header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium">Meta Ads</h2>
          <p className="text-xs text-muted">Promote your best content to homeowners in your service area</p>
        </div>
        <div className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-2">
          <div>
            <p className="text-[10px] text-muted">Ad Account</p>
            <p className="text-sm font-medium">{adAccount.name}</p>
          </div>
          <div className="h-8 w-px bg-border" />
          <div>
            <p className="text-[10px] text-muted">Lifetime Spent</p>
            <p className="text-sm font-medium">{fmtMoney(adAccount.amountSpent, adAccount.currency)}</p>
          </div>
          <span className={`h-2 w-2 rounded-full ${adAccount.status === 1 ? "bg-success" : "bg-warning"}`} />
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
          {/* Create-campaign affordance */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted">All new campaigns are created in PAUSED status — activate them in Meta Ads Manager when you&apos;re ready to spend.</p>
            <button
              onClick={() => { setShowCreateForm((v) => !v); setCreateError(null); }}
              className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90"
            >
              {showCreateForm ? "Cancel" : "+ New Campaign"}
            </button>
          </div>

          {showCreateForm && (
            <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
              <h3 className="text-sm font-medium mb-3">Create Campaign</h3>
              <div className="grid grid-cols-[1fr_180px_120px] gap-3">
                <div>
                  <label className="block text-[10px] text-muted mb-0.5">Campaign Name</label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Spring Renovation Promotion"
                    className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-muted mb-0.5">Objective</label>
                  <select
                    value={newObjective}
                    onChange={(e) => setNewObjective(e.target.value)}
                    className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs"
                  >
                    <option value="OUTCOME_TRAFFIC">Traffic to website</option>
                    <option value="OUTCOME_ENGAGEMENT">Post engagement</option>
                    <option value="OUTCOME_LEADS">Lead generation</option>
                    <option value="OUTCOME_AWARENESS">Brand awareness</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-muted mb-0.5">Daily Budget ($)</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={newBudget}
                    onChange={(e) => setNewBudget(e.target.value)}
                    className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs"
                  />
                </div>
              </div>
              {createError && (
                <p className="mt-2 text-xs text-danger">{createError}</p>
              )}
              <div className="mt-3 flex items-center justify-end gap-2">
                <button
                  onClick={submitNewCampaign}
                  disabled={creating || !newName.trim()}
                  className="rounded bg-accent px-4 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-50"
                >
                  {creating ? "Creating…" : "Create (paused)"}
                </button>
              </div>
            </div>
          )}

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
            <div className="rounded-xl border border-border bg-surface shadow-card">
              <div className="border-b border-border px-4 py-3">
                <div className="grid grid-cols-[1fr_90px_100px_90px_90px_90px] items-center text-[10px] text-muted">
                  <span>Campaign</span>
                  <span>Status</span>
                  <span>Daily Budget</span>
                  <span>Spent</span>
                  <span>Reach</span>
                  <span>Clicks</span>
                </div>
              </div>
              {campaigns.map((c) => {
                const isExpanded = expandedRow === c.id;
                const adsForThisCampaign = adsByCampaign[c.id];
                return (
                  <div key={c.id} className="border-b border-border last:border-0">
                    <button
                      onClick={() => {
                        const next = isExpanded ? null : c.id;
                        setExpandedRow(next);
                        if (next) loadAdsForCampaign(next);
                      }}
                      className="w-full px-4 py-3 hover:bg-surface-hover transition-colors text-left"
                    >
                      <div className="grid grid-cols-[1fr_90px_100px_90px_90px_90px] items-center">
                        <div className="flex items-center gap-2 min-w-0">
                          <PlatformIcon platform="facebook" size={16} />
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{c.name || c.id}</p>
                            <p className="text-[9px] text-muted">{fmtDate(c.startTime || c.createdTime)} · {c.objective.replace("OUTCOME_", "")}</p>
                          </div>
                        </div>
                        <span className={`rounded-full px-2 py-0.5 text-[9px] font-medium ${STATUS_COLORS[c.effectiveStatus] || "bg-gray-100 text-gray-500"}`}>
                          {c.effectiveStatus.toLowerCase()}
                        </span>
                        <span className="text-xs">{fmtBudgetCents(c.dailyBudget)}</span>
                        <span className="text-xs">{fmtMoney(c.insights.spend, adAccount.currency)}</span>
                        <span className="text-xs">{parseInt(c.insights.reach || "0", 10).toLocaleString()}</span>
                        <span className="text-xs">{parseInt(c.insights.clicks || "0", 10).toLocaleString()}</span>
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

                        <p className="text-[10px] text-muted">
                          Campaign ID: {c.id} · Status: {c.status} · Created {fmtDate(c.createdTime)}
                        </p>
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
                        <div className="grid grid-cols-[1fr_140px] gap-3">
                          <div>
                            <label className="block text-[10px] text-muted mb-0.5">Campaign</label>
                            <select
                              value={boostCampaignId}
                              onChange={(e) => setBoostCampaignId(e.target.value)}
                              className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs"
                            >
                              <option value="">+ Create a new campaign for this boost</option>
                              {campaigns.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name || c.id} ({c.effectiveStatus.toLowerCase()})
                                </option>
                              ))}
                            </select>
                          </div>
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
                        </div>
                        <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => { setBoostingPostId(null); setBoostCampaignId(""); }}
                              className="rounded border border-border px-3 py-1.5 text-xs text-muted hover:bg-surface-hover"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => submitBoost(post)}
                              disabled={boosting}
                              className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-50"
                            >
                              {boosting ? "Creating…" : "Create Boost (paused)"}
                            </button>
                        </div>
                        {boostError && (
                          <p className="mt-2 text-xs text-danger">{boostError}</p>
                        )}
                        <p className="mt-2 text-[10px] text-muted">
                          Boost campaigns are created in PAUSED status — activate in Meta Ads Manager when you&apos;re ready to spend.
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
