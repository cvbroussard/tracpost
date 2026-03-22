"use client";

import { useState } from "react";
import { PlatformIcon } from "@/components/platform-icons";

interface Review {
  id: string;
  platform: string;
  reviewer_name: string | null;
  reviewer_avatar_url: string | null;
  rating: number | null;
  body: string | null;
  reviewed_at: string;
  is_read: boolean;
  our_reply: string | null;
  our_reply_at: string | null;
  suggested_reply: string | null;
}

interface ReviewCardProps {
  review: Review;
  onReplied: () => void;
}

function Stars({ rating }: { rating: number | null }) {
  if (!rating) return null;
  return (
    <span className="text-sm">
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={i < rating ? "text-yellow-500" : "text-gray-300"}>
          ★
        </span>
      ))}
    </span>
  );
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

export function ReviewCard({ review, onReplied }: ReviewCardProps) {
  const [showReply, setShowReply] = useState(false);
  const [replyText, setReplyText] = useState(review.suggested_reply || "");
  const [loading, setLoading] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [error, setError] = useState("");

  async function handleSuggest() {
    setSuggesting(true);
    try {
      const res = await fetch(`/api/inbox/reviews/${review.id}/suggest`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setReplyText(data.suggestion);
      }
    } catch { /* ignore */ }
    setSuggesting(false);
  }

  async function handleSend() {
    if (!replyText.trim()) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/inbox/reviews/${review.id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: replyText.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to send reply");
        return;
      }

      onReplied();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`border-b border-border p-4 ${!review.is_read ? "bg-accent/5" : ""}`}>
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-full bg-surface-hover">
          {review.reviewer_avatar_url ? (
            <img src={review.reviewer_avatar_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-muted">
              {(review.reviewer_name || "?").charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{review.reviewer_name || "Anonymous"}</span>
            <PlatformIcon platform={review.platform} size={14} />
            <span className="text-xs text-muted">{timeAgo(review.reviewed_at)}</span>
          </div>

          <div className="mt-1">
            <Stars rating={review.rating} />
          </div>

          {review.body && (
            <p className="mt-1.5 text-sm whitespace-pre-wrap">{review.body}</p>
          )}

          {/* Our reply */}
          {review.our_reply && (
            <div className="mt-3 rounded bg-surface-hover p-3 text-sm">
              <span className="text-xs font-medium text-muted">Your response</span>
              <p className="mt-0.5">{review.our_reply}</p>
            </div>
          )}

          {/* Reply actions */}
          {!review.our_reply && (
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => {
                  setShowReply(!showReply);
                  if (!showReply && !replyText) handleSuggest();
                }}
                className="text-xs text-accent hover:text-accent/80"
              >
                Respond
              </button>
            </div>
          )}

          {showReply && !review.our_reply && (
            <div className="mt-3 space-y-2">
              {suggesting && (
                <p className="text-xs text-muted">Generating suggested response...</p>
              )}
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Write your response..."
                rows={3}
                className="w-full resize-none rounded border border-border bg-background p-2 text-sm focus:border-accent focus:outline-none"
              />
              {replyText && (
                <p className="text-xs text-muted">Suggested response — edit or send as-is</p>
              )}
              {error && <p className="text-xs text-danger">{error}</p>}
              <div className="flex gap-2">
                <button
                  onClick={handleSend}
                  disabled={!replyText.trim() || loading}
                  className="rounded bg-accent px-3 py-1 text-xs text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
                >
                  {loading ? "Sending..." : "Send Response"}
                </button>
                <button
                  onClick={handleSuggest}
                  disabled={suggesting}
                  className="rounded border border-border px-3 py-1 text-xs text-muted hover:text-foreground disabled:opacity-50"
                >
                  {suggesting ? "Generating..." : "New Suggestion"}
                </button>
                <button
                  onClick={() => setShowReply(false)}
                  className="rounded px-3 py-1 text-xs text-muted hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
