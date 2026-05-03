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
  pageId: string;
  pageName: string;
  caption: string;
  image: string | null;
  permalinkUrl: string | null;
  createdTime: string;
  engagement: number;
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
  const [activeTab, setActiveTab] = useState<"campaigns" | "boost">("campaigns");

  const [adAccount, setAdAccount] = useState<AdAccount | null>(null);
  const [adAccountLoading, setAdAccountLoading] = useState(true);

  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [campaignsLoading, setCampaignsLoading] = useState(false);
  const [campaignsError, setCampaignsError] = useState<string | null>(null);

  const [topPosts, setTopPosts] = useState<TopPost[]>([]);
  const [topPostsLoading, setTopPostsLoading] = useState(false);

  const [connecting, setConnecting] = useState(false);

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
    if (activeTab !== "boost") return;
    setTopPostsLoading(true);
    fetch("/api/dashboard/campaigns/top-posts")
      .then((r) => r.json())
      .then((data) => setTopPosts(data.posts || []))
      .finally(() => setTopPostsLoading(false));
  }, [activeTab]);

  async function startConnectFlow() {
    setConnecting(true);
    try {
      const res = await fetch("/api/auth/ads");
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
          <h2 className="text-lg font-medium">Campaign Management</h2>
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
          <h2 className="text-lg font-medium">Campaign Management</h2>
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
          onClick={() => setActiveTab("boost")}
          className={`px-4 py-2.5 text-sm transition-colors ${
            activeTab === "boost" ? "border-b-2 border-accent text-accent" : "text-muted hover:text-foreground"
          }`}
        >
          Boost a Post
        </button>
      </div>

      {/* Campaigns Tab */}
      {activeTab === "campaigns" && (
        <div className="space-y-3">
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
              {campaigns.map((c) => (
                <div key={c.id} className="border-b border-border px-4 py-3 last:border-0 hover:bg-surface-hover transition-colors">
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
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Boost Tab — Phase A surfaces real top-engagement organic posts; Phase C wires the boost-flow */}
      {activeTab === "boost" && (
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

            <div className="space-y-3">
              {topPosts.map((post) => (
                <div
                  key={post.id}
                  className="rounded-lg border border-border p-3 transition-colors hover:border-accent/50"
                >
                  <div className="flex items-start gap-3">
                    {post.image && (
                      <img src={post.image} alt="" className="h-16 w-16 rounded object-cover flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <PlatformIcon platform={post.platform} size={14} />
                        <span className="text-[10px] text-muted">{post.pageName}</span>
                      </div>
                      <p className="text-xs line-clamp-2">{post.caption || "(no caption)"}</p>
                      <div className="mt-1.5 flex gap-4 text-[10px] text-muted">
                        <span>{post.engagement.toLocaleString()} engagements</span>
                        <span>{fmtDate(post.createdTime)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
