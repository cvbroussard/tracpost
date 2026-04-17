"use client";

import { useState } from "react";
import { PlatformIcon } from "@/components/platform-icons";

type StatusFilter = "review" | "scheduled" | "live" | "all";

const ALL_PLATFORMS = [
  "instagram", "tiktok", "facebook", "youtube",
  "pinterest", "linkedin", "twitter", "gbp",
];

const STATUS_TABS: Array<{ key: StatusFilter; label: string }> = [
  { key: "review", label: "Review" },
  { key: "scheduled", label: "Scheduled" },
  { key: "live", label: "Live" },
  { key: "all", label: "All" },
];

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

type ViewMode = "firehose" | "campaign" | "channel";

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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("review");
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [posts, setPosts] = useState(recentPosts);
  const [actioning, setActioning] = useState<string | null>(null);
  const [editingCaption, setEditingCaption] = useState<{ id: string; caption: string } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function postAction(postId: string, action: "approve" | "veto" | "retry") {
    setActioning(postId);
    try {
      const endpoint = action === "approve" ? "/api/posts/approve"
        : action === "veto" ? "/api/posts/veto"
        : "/api/posts/retry";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ post_id: postId }),
      });
      if (res.ok) {
        setPosts((prev) => prev.map((p) => {
          if (p.id !== postId) return p;
          if (action === "approve") return { ...p, status: "scheduled" as const };
          if (action === "veto") return { ...p, status: "draft" as const, errorMessage: "Dismissed" };
          if (action === "retry") return { ...p, status: "scheduled" as const, errorMessage: null };
          return p;
        }));
      }
    } catch { /* ignore */ }
    setActioning(null);
  }

  async function saveCaption(postId: string, caption: string) {
    try {
      const res = await fetch("/api/posts/edit-caption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ post_id: postId, caption }),
      });
      if (res.ok) {
        setPosts((prev) => prev.map((p) =>
          p.id === postId ? { ...p, caption } : p,
        ));
      }
    } catch { /* ignore */ }
    setEditingCaption(null);
  }

  // Status-based filtering
  const statusPosts = statusFilter === "all"
    ? posts
    : posts.filter((p) => {
        if (statusFilter === "review") return p.status === "draft" || p.status === "failed";
        if (statusFilter === "scheduled") return p.status === "scheduled";
        if (statusFilter === "live") return p.status === "published";
        return true;
      });

  // Channel sub-filter
  const filteredPosts = channelFilter === "all"
    ? statusPosts
    : statusPosts.filter((p) => p.platform === channelFilter);

  // Counts per status tab
  const reviewCount = posts.filter((p) => p.status === "draft" || p.status === "failed").length;
  const scheduledCount = posts.filter((p) => p.status === "scheduled").length;
  const liveCount = posts.filter((p) => p.status === "published").length;

  const tabCounts: Record<StatusFilter, number> = {
    review: reviewCount,
    scheduled: scheduledCount,
    live: liveCount,
    all: posts.length,
  };

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

      {/* Status filter tabs */}
      <div className="flex gap-1 border-b border-border">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setStatusFilter(tab.key); setChannelFilter("all"); }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              statusFilter === tab.key
                ? "border-foreground text-foreground"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {tab.label}
            {tabCounts[tab.key] > 0 && (
              <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] ${
                statusFilter === tab.key ? "bg-foreground/10" : "bg-muted/10"
              }`}>
                {tabCounts[tab.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Channel sub-filter — all 8 platforms always visible */}
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
        {ALL_PLATFORMS.map((plat) => {
          const count = statusPosts.filter((post) => post.platform === plat).length;
          const connected = platforms.some((p) => p.platform === plat);
          return (
            <button
              key={plat}
              onClick={() => setChannelFilter(plat)}
              className={`rounded-full px-3 py-1 text-xs font-medium border ${
                channelFilter === plat
                  ? "bg-foreground text-background border-foreground"
                  : !connected
                  ? "border-border text-muted/40"
                  : "border-border text-muted hover:text-foreground"
              }`}
            >
              <PlatformIcon platform={plat} size={12} /> {plat}
              {count > 0 && <span className="ml-1 opacity-60">{count}</span>}
            </button>
          );
        })}
      </div>

      {/* Post list */}
      <div className="space-y-2">
        {filteredPosts.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-8 py-12 text-center">
            <p className="text-sm text-muted">
              {statusFilter === "review"
                ? "All caught up — nothing needs your attention."
                : statusFilter === "scheduled"
                ? "No posts scheduled."
                : "No posts published yet."}
            </p>
          </div>
        ) : (
          filteredPosts.map((post) => {
            const isExpanded = expandedId === post.id;
            const isEditable = post.status === "draft" || post.status === "failed";

            return (
              <div key={post.id} className={`rounded-lg border transition-colors ${isExpanded ? "border-accent/40 bg-surface-hover" : "border-border"}`}>
                {/* Collapsed row — hidden when expanded */}
                {!isExpanded && (
                  <div
                    className="flex items-center gap-3 p-3 cursor-pointer"
                    onClick={() => setExpandedId(post.id)}
                  >
                    {post.mediaUrl && (
                      <img
                        src={post.mediaUrl}
                        alt=""
                        className="h-10 w-10 rounded object-cover flex-shrink-0"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="flex-shrink-0"><PlatformIcon platform={post.platform} size={14} /></span>
                        {statusBadge(post.status)}
                        <span className="text-muted">{formatDate(post.publishedAt)}</span>
                      </div>
                      {post.caption && (
                        <p className="mt-1 text-xs text-muted truncate">{post.caption}</p>
                      )}
                    </div>
                    <span className="text-[10px] text-muted">▼</span>
                  </div>
                )}

                {/* Expanded pane */}
                {isExpanded && (
                  <div className="p-3">
                    {/* Expanded header */}
                    <div className="flex items-center gap-2 mb-3 text-xs">
                      <span className="flex-shrink-0"><PlatformIcon platform={post.platform} size={14} /></span>
                      {statusBadge(post.status)}
                      <span className="text-muted">{formatDate(post.publishedAt)}</span>
                      <button
                        onClick={() => setExpandedId(null)}
                        className="ml-auto text-[10px] text-muted hover:text-foreground"
                      >
                        ▲ Collapse
                      </button>
                    </div>
                    <div className="flex gap-4">
                      {/* Enlarged thumbnail */}
                      {post.mediaUrl && (
                        <img
                          src={post.mediaUrl}
                          alt=""
                          className="h-24 w-24 rounded-lg object-cover flex-shrink-0"
                        />
                      )}

                      <div className="flex-1 min-w-0 space-y-3">
                        {/* Editable caption */}
                        {editingCaption?.id === post.id ? (
                          <div className="space-y-2">
                            <textarea
                              value={editingCaption.caption}
                              onChange={(e) => setEditingCaption({ ...editingCaption, caption: e.target.value })}
                              onKeyDown={(e) => {
                                if (e.key === "Escape") setEditingCaption(null);
                              }}
                              className="w-full rounded border border-border bg-background px-3 py-2 text-xs"
                              rows={3}
                              autoFocus
                            />
                            <div className="flex gap-1">
                              <button
                                onClick={() => saveCaption(post.id, editingCaption.caption)}
                                className="rounded bg-accent px-3 py-1 text-[10px] font-medium text-white"
                              >
                                Save caption
                              </button>
                              <button
                                onClick={() => setEditingCaption(null)}
                                className="px-2 py-1 text-[10px] text-muted hover:text-foreground"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div
                            className={isEditable ? "cursor-pointer" : ""}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isEditable) setEditingCaption({ id: post.id, caption: post.caption || "" });
                            }}
                          >
                            <p className="text-xs leading-relaxed">
                              {post.caption || <span className="text-muted italic">No caption</span>}
                            </p>
                            {isEditable && (
                              <p className="mt-1 text-[10px] text-muted">Click to edit caption</p>
                            )}
                          </div>
                        )}

                        {/* Error message */}
                        {post.errorMessage && (
                          <p className="text-[10px] text-danger">{post.errorMessage}</p>
                        )}

                        {/* Action buttons */}
                        <div className="flex items-center gap-2 pt-1">
                          {post.status === "draft" && (
                            <>
                              <button
                                onClick={(e) => { e.stopPropagation(); postAction(post.id, "approve"); }}
                                disabled={actioning === post.id}
                                className="rounded bg-success/90 px-3 py-1.5 text-xs font-medium text-white hover:bg-success disabled:opacity-50"
                              >
                                Approve
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); postAction(post.id, "veto"); }}
                                disabled={actioning === post.id}
                                className="px-3 py-1.5 text-xs text-muted hover:text-danger"
                              >
                                Dismiss
                              </button>
                            </>
                          )}
                          {post.status === "failed" && (
                            <>
                              <button
                                onClick={(e) => { e.stopPropagation(); postAction(post.id, "retry"); }}
                                disabled={actioning === post.id}
                                className="rounded bg-accent/90 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent disabled:opacity-50"
                              >
                                Retry
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); postAction(post.id, "veto"); }}
                                disabled={actioning === post.id}
                                className="px-3 py-1.5 text-xs text-muted hover:text-danger"
                              >
                                Dismiss
                              </button>
                            </>
                          )}
                          {post.status === "scheduled" && (
                            <button
                              onClick={(e) => { e.stopPropagation(); postAction(post.id, "veto"); }}
                              disabled={actioning === post.id}
                              className="px-3 py-1.5 text-xs text-muted hover:text-danger"
                            >
                              Cancel
                            </button>
                          )}
                          {post.platformPostUrl && (
                            <a
                              href={post.platformPostUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="px-3 py-1.5 text-xs text-muted hover:text-foreground"
                            >
                              View on platform ↗
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
