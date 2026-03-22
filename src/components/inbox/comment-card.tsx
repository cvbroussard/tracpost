"use client";

import { useState } from "react";
import { PlatformIcon } from "@/components/platform-icons";
import { ReplyComposer } from "./reply-composer";

interface Comment {
  id: string;
  platform: string;
  author_name: string;
  author_username: string | null;
  author_avatar_url: string | null;
  body: string;
  commented_at: string;
  is_read: boolean;
  our_reply: string | null;
  our_reply_at: string | null;
  parent_comment_id: string | null;
}

interface CommentCardProps {
  comment: Comment;
  onReplied: () => void;
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

export function CommentCard({ comment, onReplied }: CommentCardProps) {
  const [showReply, setShowReply] = useState(false);
  const isThread = !!comment.parent_comment_id;

  return (
    <div className={`border-b border-border p-4 ${isThread ? "ml-8" : ""} ${!comment.is_read ? "bg-accent/5" : ""}`}>
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="h-8 w-8 flex-shrink-0 overflow-hidden rounded-full bg-surface-hover">
          {comment.author_avatar_url ? (
            <img src={comment.author_avatar_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-muted">
              {comment.author_name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{comment.author_name}</span>
            {comment.author_username && (
              <span className="text-xs text-muted">@{comment.author_username}</span>
            )}
            <PlatformIcon platform={comment.platform} size={12} />
            <span className="text-xs text-muted">{timeAgo(comment.commented_at)}</span>
          </div>
          <p className="mt-1 text-sm whitespace-pre-wrap">{comment.body}</p>

          {/* Our reply */}
          {comment.our_reply && (
            <div className="mt-2 rounded bg-surface-hover p-2 text-sm">
              <span className="text-xs font-medium text-muted">Your reply</span>
              <p className="mt-0.5">{comment.our_reply}</p>
            </div>
          )}

          {/* Actions */}
          {!comment.our_reply && (
            <div className="mt-2">
              <button
                onClick={() => setShowReply(!showReply)}
                className="text-xs text-accent hover:text-accent/80"
              >
                Reply
              </button>
            </div>
          )}

          {showReply && (
            <div className="mt-2">
              <ReplyComposer
                commentId={comment.id}
                onSent={() => {
                  setShowReply(false);
                  onReplied();
                }}
                onCancel={() => setShowReply(false)}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
