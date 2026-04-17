"use client";

import { useState } from "react";

type ViewMode = "firehose" | "campaign" | "channel";

interface PostItem {
  id: string;
  caption: string | null;
  mediaUrl: string | null;
  platform: string;
  accountName: string;
  status: "published" | "scheduled" | "failed" | "draft";
  publishedAt: string | null;
  platformPostUrl: string | null;
  errorMessage: string | null;
}

interface PlatformInfo {
  platform: string;
  accountName: string;
  status: string;
  followers: number | null;
}

interface CampaignGroup {
  sourceAssetId: string | null;
  sourceImageUrl: string | null;
  contextNote: string | null;
  platformCount: number;
  publishedCount: number;
  firstPublished: string | null;
  platforms: string[];
}

interface Props {
  metrics: {
    totalFollowers: number;
    postsThisWeek: number;
    totalPosts: number;
  };
  recentPosts: PostItem[];
  platforms: PlatformInfo[];
  campaignGroups: CampaignGroup[];
}

const PLATFORM_ICONS: Record<string, string> = {
  instagram: "📷",
  tiktok: "🎵",
  facebook: "📘",
  twitter: "𝕏",
  x: "𝕏",
  youtube: "▶️",
  pinterest: "📌",
  linkedin: "💼",
  gbp: "📍",
};

const VIEW_TABS: Array<{ key: ViewMode; label: string }> = [
  { key: "campaign", label: "Campaign" },
  { key: "firehose", label: "All Posts" },
  { key: "channel", label: "By Channel" },
];

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    published: "bg-success/10 text-success",
    scheduled: "bg-accent/10 text-accent",
    failed: "bg-danger/10 text-danger",
    draft: "bg-muted/10 text-muted",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${colors[status] || "bg-muted/10 text-muted"}`}>
      {status}
    </span>
  );
}

export function UnipostDashboard({ metrics, recentPosts, platforms, campaignGroups }: Props) {
  const [view, setView] = useState<ViewMode>("campaign");
  const [channelFilter, setChannelFilter] = useState<string>("all");

  const filteredPosts = channelFilter === "all"
    ? recentPosts
    : recentPosts.filter((p) => p.platform === channelFilter);

  return (
    <div className="space-y-6">
      {/* Metrics strip */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-border p-4 text-center">
          <p className="text-2xl font-bold">{metrics.totalFollowers.toLocaleString()}</p>
          <p className="text-xs text-muted">Total followers</p>
        </div>
        <div className="rounded-lg border border-border p-4 text-center">
          <p className="text-2xl font-bold">{metrics.postsThisWeek}</p>
          <p className="text-xs text-muted">Posts this week</p>
        </div>
        <div className="rounded-lg border border-border p-4 text-center">
          <p className="text-2xl font-bold">{metrics.totalPosts}</p>
          <p className="text-xs text-muted">Total published</p>
        </div>
      </div>

      {/* Connected platforms strip */}
      <div className="flex gap-2 flex-wrap">
        {platforms.map((p) => (
          <div
            key={p.platform}
            className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs"
          >
            <span>{PLATFORM_ICONS[p.platform] || "🔗"}</span>
            <span className="font-medium">{p.platform}</span>
            {p.followers !== null && (
              <span className="text-muted">{p.followers.toLocaleString()}</span>
            )}
            <span className={`h-1.5 w-1.5 rounded-full ${p.status === "active" ? "bg-success" : "bg-muted"}`} />
          </div>
        ))}
      </div>

      {/* View mode tabs */}
      <div className="flex gap-1 border-b border-border">
        {VIEW_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setView(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              view === tab.key
                ? "border-foreground text-foreground"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Campaign view */}
      {view === "campaign" && (
        <div className="space-y-3">
          {campaignGroups.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted">No published content yet.</p>
          ) : (
            campaignGroups.map((group, i) => (
              <div key={i} className="flex items-start gap-4 rounded-lg border border-border p-4">
                {group.sourceImageUrl && (
                  <img
                    src={group.sourceImageUrl}
                    alt=""
                    className="h-16 w-16 rounded object-cover flex-shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {group.contextNote || "Untitled content"}
                  </p>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                    <span>{group.publishedCount} of {group.platformCount} published</span>
                    <span>·</span>
                    <span>{formatDate(group.firstPublished)}</span>
                  </div>
                  <div className="mt-2 flex gap-1">
                    {group.platforms.map((plat) => (
                      <span
                        key={plat}
                        className="rounded bg-surface-hover px-1.5 py-0.5 text-[10px]"
                        title={plat}
                      >
                        {PLATFORM_ICONS[plat] || plat}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Firehose view */}
      {view === "firehose" && (
        <div className="space-y-2">
          {recentPosts.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted">No posts yet.</p>
          ) : (
            recentPosts.map((post) => (
              <div key={post.id} className="flex items-start gap-3 rounded-lg border border-border p-3">
                {post.mediaUrl && (
                  <img
                    src={post.mediaUrl}
                    alt=""
                    className="h-12 w-12 rounded object-cover flex-shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-xs">
                    <span>{PLATFORM_ICONS[post.platform] || "🔗"}</span>
                    <span className="font-medium">{post.platform}</span>
                    {statusBadge(post.status)}
                    <span className="text-muted">{formatDate(post.publishedAt)}</span>
                  </div>
                  {post.caption && (
                    <p className="mt-1 text-xs text-muted truncate">{post.caption}</p>
                  )}
                  {post.errorMessage && (
                    <p className="mt-1 text-[10px] text-danger">{post.errorMessage}</p>
                  )}
                </div>
                {post.platformPostUrl && (
                  <a
                    href={post.platformPostUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-muted hover:text-foreground flex-shrink-0"
                  >
                    ↗
                  </a>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Channel view */}
      {view === "channel" && (
        <div className="space-y-4">
          {/* Channel filter tabs */}
          <div className="flex gap-1 flex-wrap">
            <button
              onClick={() => setChannelFilter("all")}
              className={`rounded-full px-3 py-1 text-xs font-medium border ${
                channelFilter === "all"
                  ? "bg-foreground text-background border-foreground"
                  : "border-border text-muted hover:text-foreground"
              }`}
            >
              All
            </button>
            {platforms.map((p) => (
              <button
                key={p.platform}
                onClick={() => setChannelFilter(p.platform)}
                className={`rounded-full px-3 py-1 text-xs font-medium border ${
                  channelFilter === p.platform
                    ? "bg-foreground text-background border-foreground"
                    : "border-border text-muted hover:text-foreground"
                }`}
              >
                {PLATFORM_ICONS[p.platform] || ""} {p.platform}
              </button>
            ))}
          </div>

          {/* Channel-specific health strip */}
          {channelFilter !== "all" && (
            <div className="rounded-lg border border-border bg-surface-hover p-3">
              {(() => {
                const plat = platforms.find((p) => p.platform === channelFilter);
                if (!plat) return null;
                const channelPosts = recentPosts.filter((p) => p.platform === channelFilter);
                const published = channelPosts.filter((p) => p.status === "published").length;
                return (
                  <div className="flex items-center gap-6 text-xs">
                    <span><strong>{plat.accountName}</strong></span>
                    {plat.followers !== null && <span>{plat.followers.toLocaleString()} followers</span>}
                    <span>{published} posts published</span>
                    <span className={`h-2 w-2 rounded-full ${plat.status === "active" ? "bg-success" : "bg-muted"}`} />
                  </div>
                );
              })()}
            </div>
          )}

          {/* Filtered post list */}
          <div className="space-y-2">
            {filteredPosts.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted">No posts for this channel.</p>
            ) : (
              filteredPosts.map((post) => (
                <div key={post.id} className="flex items-start gap-3 rounded-lg border border-border p-3">
                  {post.mediaUrl && (
                    <img
                      src={post.mediaUrl}
                      alt=""
                      className="h-12 w-12 rounded object-cover flex-shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-xs">
                      <span>{PLATFORM_ICONS[post.platform] || "🔗"}</span>
                      <span className="font-medium">{post.platform}</span>
                      {statusBadge(post.status)}
                      <span className="text-muted">{formatDate(post.publishedAt)}</span>
                    </div>
                    {post.caption && (
                      <p className="mt-1 text-xs text-muted truncate">{post.caption}</p>
                    )}
                  </div>
                  {post.platformPostUrl && (
                    <a
                      href={post.platformPostUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-muted hover:text-foreground flex-shrink-0"
                    >
                      ↗
                    </a>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
