"use client";

import { useState } from "react";
import { PlatformIcon } from "@/components/platform-icons";

interface Props {
  siteId: string;
}

const MOCK_AD_ACCOUNT = {
  id: "act_460886260653822",
  name: "RRG",
  status: "Active",
  currency: "USD",
  spent: "$847.23",
};

const MOCK_CAMPAIGNS = [
  {
    id: "c1",
    name: "Kitchen Reveal — Point Breeze",
    platform: "facebook",
    status: "active",
    budget: "$15.00/day",
    spent: "$42.30",
    impressions: 3842,
    clicks: 127,
    calls: 8,
    startDate: "Apr 15, 2026",
    postPreview: "https://assets.tracpost.com/sites/a2df5b78-a607-4633-aa09-8e116e2ccfb2/media/point-breeze-full-renovation-bsquared-construction-img_4a51d-04-14.jpg",
  },
  {
    id: "c2",
    name: "Steel Beam Installation",
    platform: "instagram",
    status: "active",
    budget: "$10.00/day",
    spent: "$28.50",
    impressions: 2156,
    clicks: 89,
    calls: 5,
    startDate: "Apr 16, 2026",
    postPreview: null,
  },
  {
    id: "c3",
    name: "Timber Frame Portico",
    platform: "facebook",
    status: "completed",
    budget: "$10.00/day",
    spent: "$70.00",
    impressions: 6421,
    clicks: 215,
    calls: 12,
    startDate: "Apr 1, 2026",
    postPreview: null,
  },
];

const MOCK_TOP_POSTS = [
  {
    id: "p1",
    platform: "instagram",
    caption: "Custom lacquer inset cabinets by Crystal Cabinet Works with a Lacanche Sully range. This kitchen was designed for someone who takes cooking seriously.",
    engagement: 342,
    reach: 2847,
    image: "https://assets.tracpost.com/sites/a2df5b78-a607-4633-aa09-8e116e2ccfb2/media/point-breeze-full-renovation-bsquared-construction-img_4a51d-04-14.jpg",
    boosted: false,
  },
  {
    id: "p2",
    platform: "facebook",
    caption: "Ah, steel beams... when load bearing walls must go away in favor of an open floor plan, structural steel makes it happen.",
    engagement: 186,
    reach: 1523,
    image: null,
    boosted: false,
  },
  {
    id: "p3",
    platform: "instagram",
    caption: "Zellige tile backsplash with rift-sawn white oak floating shelves. Every detail in this kitchen tells a story.",
    engagement: 274,
    reach: 2103,
    image: null,
    boosted: true,
  },
];

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800",
  completed: "bg-gray-100 text-gray-500",
  paused: "bg-amber-100 text-amber-800",
};

export function CampaignsClient({ siteId }: Props) {
  const [activeTab, setActiveTab] = useState<"campaigns" | "boost">("campaigns");
  const [boostingPost, setBoostingPost] = useState<string | null>(null);
  const [boostBudget, setBoostBudget] = useState("10");
  const [boostDuration, setBoostDuration] = useState("3");
  const [boostConfirmed, setBoostConfirmed] = useState(false);

  return (
    <div className="p-4 mx-auto max-w-5xl">
      {/* Ad Account Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium">Campaign Management</h2>
          <p className="text-xs text-muted">Promote your best content to homeowners in your service area</p>
        </div>
        <div className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-2">
          <div>
            <p className="text-[10px] text-muted">Ad Account</p>
            <p className="text-sm font-medium">{MOCK_AD_ACCOUNT.name}</p>
          </div>
          <div className="h-8 w-px bg-border" />
          <div>
            <p className="text-[10px] text-muted">Total Spent</p>
            <p className="text-sm font-medium">{MOCK_AD_ACCOUNT.spent}</p>
          </div>
          <span className={`h-2 w-2 rounded-full bg-success`} />
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-1 border-b border-border">
        <button
          onClick={() => setActiveTab("campaigns")}
          className={`px-4 py-2.5 text-sm transition-colors ${
            activeTab === "campaigns"
              ? "border-b-2 border-accent text-accent"
              : "text-muted hover:text-foreground"
          }`}
        >
          Active Campaigns
        </button>
        <button
          onClick={() => setActiveTab("boost")}
          className={`px-4 py-2.5 text-sm transition-colors ${
            activeTab === "boost"
              ? "border-b-2 border-accent text-accent"
              : "text-muted hover:text-foreground"
          }`}
        >
          Boost a Post
        </button>
      </div>

      {/* Campaigns Tab */}
      {activeTab === "campaigns" && (
        <div className="space-y-3">
          {/* Summary cards */}
          <div className="grid grid-cols-4 gap-3">
            <div className="rounded-xl border border-border bg-surface p-3 shadow-card">
              <p className="text-2xl font-semibold">2</p>
              <p className="text-xs text-muted">Active campaigns</p>
            </div>
            <div className="rounded-xl border border-border bg-surface p-3 shadow-card">
              <p className="text-2xl font-semibold">$140.80</p>
              <p className="text-xs text-muted">Total spent this month</p>
            </div>
            <div className="rounded-xl border border-border bg-surface p-3 shadow-card">
              <p className="text-2xl font-semibold">12,419</p>
              <p className="text-xs text-muted">Total impressions</p>
            </div>
            <div className="rounded-xl border border-border bg-surface p-3 shadow-card">
              <p className="text-2xl font-semibold">25</p>
              <p className="text-xs text-muted">Calls generated</p>
            </div>
          </div>

          {/* Campaign list */}
          <div className="rounded-xl border border-border bg-surface shadow-card">
            <div className="border-b border-border px-4 py-3">
              <div className="grid grid-cols-[1fr_80px_100px_80px_80px_80px_60px] items-center text-[10px] text-muted">
                <span>Campaign</span>
                <span>Status</span>
                <span>Budget</span>
                <span>Spent</span>
                <span>Reach</span>
                <span>Clicks</span>
                <span>Calls</span>
              </div>
            </div>
            {MOCK_CAMPAIGNS.map((c) => (
              <div key={c.id} className="border-b border-border px-4 py-3 last:border-0 hover:bg-surface-hover transition-colors">
                <div className="grid grid-cols-[1fr_80px_100px_80px_80px_80px_60px] items-center">
                  <div className="flex items-center gap-2">
                    <PlatformIcon platform={c.platform} size={16} />
                    <span className="text-sm font-medium">{c.name}</span>
                    <span className="text-[9px] text-muted">{c.startDate}</span>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[9px] font-medium ${STATUS_COLORS[c.status]}`}>
                    {c.status}
                  </span>
                  <span className="text-xs">{c.budget}</span>
                  <span className="text-xs">{c.spent}</span>
                  <span className="text-xs">{c.impressions.toLocaleString()}</span>
                  <span className="text-xs">{c.clicks}</span>
                  <span className="text-xs font-medium text-accent">{c.calls}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Boost Tab */}
      {activeTab === "boost" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
            <h3 className="text-sm font-medium mb-1">Top Performing Organic Posts</h3>
            <p className="text-xs text-muted mb-4">Posts with high engagement are great candidates for promotion. Select one to boost.</p>

            <div className="space-y-3">
              {MOCK_TOP_POSTS.map((post) => (
                <div
                  key={post.id}
                  className={`rounded-lg border p-3 transition-colors cursor-pointer ${
                    boostingPost === post.id
                      ? "border-accent bg-accent/5"
                      : "border-border hover:border-accent/50"
                  }`}
                  onClick={() => { setBoostingPost(post.id); setBoostConfirmed(false); }}
                >
                  <div className="flex items-start gap-3">
                    {post.image && (
                      <img src={post.image} alt="" className="h-16 w-16 rounded object-cover flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <PlatformIcon platform={post.platform} size={14} />
                        {post.boosted && (
                          <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[9px] text-accent font-medium">
                            Already boosted
                          </span>
                        )}
                      </div>
                      <p className="text-xs line-clamp-2">{post.caption}</p>
                      <div className="mt-1.5 flex gap-4 text-[10px] text-muted">
                        <span>{post.reach.toLocaleString()} reach</span>
                        <span>{post.engagement} engagements</span>
                        <span>{((post.engagement / post.reach) * 100).toFixed(1)}% engagement rate</span>
                      </div>
                    </div>
                  </div>

                  {/* Boost config — inline when selected */}
                  {boostingPost === post.id && !post.boosted && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <label className="block text-[9px] text-muted mb-0.5">Daily Budget</label>
                          <select
                            value={boostBudget}
                            onChange={(e) => setBoostBudget(e.target.value)}
                            className="w-full bg-surface-hover px-2 py-1.5 text-xs"
                          >
                            <option value="5">$5/day</option>
                            <option value="10">$10/day</option>
                            <option value="15">$15/day</option>
                            <option value="25">$25/day</option>
                            <option value="50">$50/day</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[9px] text-muted mb-0.5">Duration</label>
                          <select
                            value={boostDuration}
                            onChange={(e) => setBoostDuration(e.target.value)}
                            className="w-full bg-surface-hover px-2 py-1.5 text-xs"
                          >
                            <option value="3">3 days</option>
                            <option value="5">5 days</option>
                            <option value="7">7 days</option>
                            <option value="14">14 days</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[9px] text-muted mb-0.5">Audience</label>
                          <div className="bg-surface-hover px-2 py-1.5 text-xs text-muted">
                            Homeowners · 25mi radius
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <p className="text-[10px] text-muted">
                          Estimated: ${parseInt(boostBudget) * parseInt(boostDuration)} total · {Math.round(parseInt(boostBudget) * parseInt(boostDuration) * 180)} - {Math.round(parseInt(boostBudget) * parseInt(boostDuration) * 350)} impressions
                        </p>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setBoostConfirmed(true);
                          }}
                          className="rounded bg-accent px-4 py-1.5 text-xs font-medium text-white hover:bg-accent/90"
                        >
                          Boost Post
                        </button>
                      </div>
                      {boostConfirmed && (
                        <div className="mt-2 rounded bg-success/10 px-3 py-2 text-xs text-success">
                          Campaign created. Meta will charge your payment method directly. You can track performance in the Active Campaigns tab.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Auto-boost config */}
          <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
            <h3 className="text-sm font-medium mb-1">Auto-Boost</h3>
            <p className="text-xs text-muted mb-3">
              Automatically promote posts that exceed your engagement threshold. Set it once, TracPost handles the rest.
            </p>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-[9px] text-muted mb-0.5">Trigger</label>
                <select className="w-full bg-surface-hover px-2 py-1.5 text-xs">
                  <option>Engagement rate &gt; 5%</option>
                  <option>Engagement rate &gt; 3%</option>
                  <option>Reach &gt; 1,000</option>
                  <option>All posts</option>
                </select>
              </div>
              <div>
                <label className="block text-[9px] text-muted mb-0.5">Budget per boost</label>
                <select className="w-full bg-surface-hover px-2 py-1.5 text-xs">
                  <option>$10/day for 3 days</option>
                  <option>$15/day for 3 days</option>
                  <option>$10/day for 7 days</option>
                  <option>$25/day for 3 days</option>
                </select>
              </div>
              <div>
                <label className="block text-[9px] text-muted mb-0.5">Monthly cap</label>
                <select className="w-full bg-surface-hover px-2 py-1.5 text-xs">
                  <option>$200/month</option>
                  <option>$500/month</option>
                  <option>$1,000/month</option>
                  <option>No limit</option>
                </select>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <button className="rounded bg-accent px-4 py-1.5 text-xs font-medium text-white hover:bg-accent/90">
                Enable Auto-Boost
              </button>
              <span className="text-[10px] text-muted">Audience: Homeowners within 25 miles of Pittsburgh, PA</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
