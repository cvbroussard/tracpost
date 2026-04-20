"use client";

import { useState } from "react";
import { PostGroupCard } from "@/components/inbox/post-group-card";
import { CommentCard } from "@/components/inbox/comment-card";
import { EmptyState } from "@/components/empty-state";

export interface PostGroup {
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Comment = any;

interface CommentsListClientProps {
  postGroups: PostGroup[];
  siteId: string;
}

export function CommentsListClient({ postGroups, siteId }: CommentsListClientProps) {
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [didAutoSelect, setDidAutoSelect] = useState(false);

  async function loadComments(platformPostId: string) {
    setSelectedPostId(platformPostId);
    setLoading(true);
    try {
      const res = await fetch(`/api/inbox/comments/${platformPostId}?site_id=${siteId}`);
      if (res.ok) {
        const data = await res.json();
        setComments(data.comments);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }

  if (!didAutoSelect && postGroups.length > 0) {
    setDidAutoSelect(true);
    loadComments(postGroups[0].platform_post_id);
  }

  if (postGroups.length === 0) {
    return (
      <EmptyState
        icon="▤"
        title="No comments yet"
        description="Comments on your published posts will appear here once synced."
      />
    );
  }

  return (
    <div className="flex h-full">
      {/* Post list */}
      <div className={`w-full border-r border-border md:w-80 ${selectedPostId ? "hidden md:block" : ""}`}>
        {postGroups.map((group) => (
          <PostGroupCard
            key={group.platform_post_id}
            group={group}
            onClick={loadComments}
          />
        ))}
      </div>

      {/* Comment thread */}
      <div className={`flex-1 ${selectedPostId ? "" : "hidden md:flex md:items-center md:justify-center"}`}>
        {selectedPostId ? (
          <div>
            {/* Back button (mobile) */}
            <button
              onClick={() => setSelectedPostId(null)}
              className="border-b border-border p-3 text-sm text-accent md:hidden"
            >
              ← Back to posts
            </button>

            {loading ? (
              <div className="p-8 text-center text-sm text-muted">Loading comments...</div>
            ) : (
              comments.map((comment: Comment) => (
                <CommentCard
                  key={comment.id}
                  comment={comment}
                  onReplied={() => loadComments(selectedPostId)}
                />
              ))
            )}
          </div>
        ) : (
          <p className="text-sm text-muted">Select a post to view comments</p>
        )}
      </div>
    </div>
  );
}
