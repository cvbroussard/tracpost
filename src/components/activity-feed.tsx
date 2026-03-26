"use client";

import { useState } from "react";

interface ActivityItem {
  id: string;
  type: "published" | "scheduled" | "triaged" | "blog" | "review" | "caption" | "pipeline";
  message: string;
  detail?: string;
  timestamp: string;
}

const TYPE_ICONS: Record<string, string> = {
  published: "▶",
  scheduled: "▦",
  triaged: "◎",
  blog: "◇",
  review: "★",
  caption: "◈",
  pipeline: "◆",
};

const TYPE_COLORS: Record<string, string> = {
  published: "text-success",
  scheduled: "text-accent",
  triaged: "text-muted",
  blog: "text-accent",
  review: "text-warning",
  caption: "text-muted",
  pipeline: "text-muted",
};

export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <>
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full border-b border-border px-5 py-4 text-left"
      >
        <div className="flex items-center justify-between">
          <h3 style={{ fontSize: 15, fontWeight: 600 }}>Activity</h3>
          <span className="text-xs text-muted">{collapsed ? "▸" : "▾"}</span>
        </div>
      </button>

      {!collapsed && (
        <div className="flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <p className="text-xs text-muted">No activity yet</p>
            </div>
          ) : (
            <div className="px-4 py-2">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex gap-3 border-b border-border py-3 last:border-0"
                >
                  <span className={`mt-0.5 text-xs ${TYPE_COLORS[item.type] || "text-muted"}`}>
                    {TYPE_ICONS[item.type] || "·"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs leading-relaxed">{item.message}</p>
                    {item.detail && (
                      <p className="mt-0.5 truncate text-[11px] text-dim">{item.detail}</p>
                    )}
                    <p className="mt-1 text-[10px] text-dim" suppressHydrationWarning>{timeAgo(item.timestamp)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

function timeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
