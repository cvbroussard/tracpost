"use client";

import { PlatformIcon } from "@/components/platform-icons";

interface PostGroup {
  platform_post_id: string;
  platform: string;
  post_id: string | null;
  caption: string | null;
  media_urls: string[] | null;
  platform_post_url: string | null;
  comment_count: number;
  unread_count: number;
  latest_activity: string;
}

interface PostGroupCardProps {
  group: PostGroup;
  onClick: (platformPostId: string) => void;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function PostGroupCard({ group, onClick }: PostGroupCardProps) {
  const thumbnail = group.media_urls?.[0];
  const captionSnippet = group.caption
    ? group.caption.slice(0, 80) + (group.caption.length > 80 ? "..." : "")
    : "No caption";

  return (
    <button
      onClick={() => onClick(group.platform_post_id)}
      className="flex w-full items-start gap-3 border-b border-border p-4 text-left transition-colors hover:bg-surface-hover"
    >
      {/* Thumbnail */}
      <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded bg-surface-hover">
        {thumbnail ? (
          <img src={thumbnail} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <PlatformIcon platform={group.platform} size={20} />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <PlatformIcon platform={group.platform} size={14} />
          <span className="text-xs text-muted">{timeAgo(group.latest_activity)}</span>
        </div>
        <p className="mt-0.5 truncate text-sm">{captionSnippet}</p>
      </div>

      {/* Count badge */}
      <div className="flex flex-col items-end gap-1">
        <span className="text-xs text-muted">{group.comment_count} comment{group.comment_count !== 1 ? "s" : ""}</span>
        {group.unread_count > 0 && (
          <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-accent px-1.5 text-xs text-white">
            {group.unread_count}
          </span>
        )}
      </div>
    </button>
  );
}
