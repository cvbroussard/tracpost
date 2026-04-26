"use client";

import { useState, useEffect, useCallback } from "react";
import { ManagePage } from "@/components/manage/manage-page";
import { PlatformIcon } from "@/components/platform-icon";

interface Event {
  id: string;
  platform: string;
  event_type: string;
  body: string | null;
  sentiment: string | null;
  permalink: string | null;
  occurred_at: string;
  review_status: string;
  engaged_person_id: string | null;
  star_rating: string | null;
  person_display_name: string | null;
  person_handle: string | null;
  person_avatar_url: string | null;
}

const STAR_RATING_VALUE: Record<string, number> = {
  ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5,
};

function StarBar({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-px" aria-label={`${rating} star${rating === 1 ? "" : "s"}`}>
      {[1, 2, 3, 4, 5].map(n => (
        <svg key={n} viewBox="0 0 24 24" width="11" height="11" fill={n <= rating ? "#FBBC05" : "#e2e8f0"}>
          <path d="M12 2l2.9 6.9 7.4.7-5.6 4.9 1.7 7.3L12 17.8 5.6 21.8l1.7-7.3L1.7 9.6l7.4-.7L12 2z" />
        </svg>
      ))}
    </span>
  );
}

interface Person {
  id: string;
  display_name: string;
  engagement_count: number;
  positive_engagements: number;
  negative_engagements: number;
  is_advocate: boolean;
  is_influencer: boolean;
  last_seen_at: string;
  avatar_url: string | null;
  handles: Array<{ platform: string; handle: string; follower_count: number | null; avatar_url: string | null }> | null;
}

interface Summary {
  total_events: number;
  unreviewed: number;
  positive: number;
  negative: number;
  neutral: number;
  byPlatform: Array<{ platform: string; count: number }>;
}

const PLATFORM_LABEL: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  gbp: "Google Business Profile",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  tiktok: "TikTok",
  twitter: "X",
  pinterest: "Pinterest",
};

const SENTIMENT_COLOR: Record<string, string> = {
  positive: "text-success bg-success/10",
  negative: "text-danger bg-danger/10",
  neutral: "text-muted bg-surface-hover",
};

const EVENT_TYPE_LABEL: Record<string, string> = {
  comment: "Comment",
  review: "Review",
  mention: "Mention",
  tag: "Tag",
  dm: "Direct Message",
  story_mention: "Story Mention",
};

function EngageContent({ subscriberId, siteId }: { subscriberId: string; siteId: string }) {
  const [tab, setTab] = useState<"inbox" | "people" | "activity">("inbox");
  const [events, setEvents] = useState<Event[]>([]);
  const [persons, setPersons] = useState<Person[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [capturing, setCapturing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [replyOpen, setReplyOpen] = useState<string | null>(null);
  const [replyText, setReplyText] = useState<string>("");
  const [replying, setReplying] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const load = useCallback(() => {
    const siteParam = siteId !== "all" ? `&site_id=${siteId}` : "";
    const archivedParam = showArchived ? "&include_archived=true" : "";
    fetch(`/api/admin/engage?subscription_id=${subscriberId}${siteParam}${archivedParam}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return;
        setEvents(d.events || []);
        setPersons(d.persons || []);
        setSummary(d.summary || null);
      })
      .finally(() => setLoading(false));
  }, [subscriberId, siteId, showArchived]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  async function runCapture() {
    setCapturing(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/engage/capture", { method: "POST" });
      const d = await res.json();
      const s = d.summary || {};
      setMessage(`Captured ${s.total_new || 0} new events from ${s.assets_processed || 0} assets`);
      load();
    } catch {
      setMessage("Capture failed");
    }
    setCapturing(false);
  }

  async function setStatus(eventId: string, status: "reviewed" | "archived" | "new") {
    const res = await fetch("/api/admin/engage/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId, status }),
    });
    if (res.ok) {
      // Optimistically remove from list (inbox excludes archived; reviewed stays visible but updates badge)
      setEvents(prev => status === "archived" ? prev.filter(e => e.id !== eventId) : prev.map(e => e.id === eventId ? { ...e, review_status: status } : e));
    }
  }

  async function moderate(eventId: string, action: "hide" | "delete") {
    const verb = action === "hide" ? "Hide this comment on the platform?" : "Delete this comment on the platform? This cannot be undone.";
    if (!confirm(verb)) return;
    setMessage(null);
    const res = await fetch("/api/admin/engage/moderate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId, action }),
    });
    const d = await res.json();
    if (res.ok) {
      setMessage(`Comment ${action === "hide" ? "hidden" : "deleted"} on platform`);
      setEvents(prev => prev.filter(e => e.id !== eventId));
    } else {
      setMessage(`Moderation failed: ${d.error || "unknown error"}`);
    }
  }

  async function sendReply(eventId: string) {
    if (!replyText.trim()) return;
    setReplying(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/engage/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, body: replyText.trim() }),
      });
      const d = await res.json();
      if (res.ok) {
        setMessage("Reply posted");
        setReplyOpen(null);
        setReplyText("");
        setEvents(prev => prev.map(e => e.id === eventId ? { ...e, review_status: "reviewed" } : e));
      } else {
        setMessage(`Reply failed: ${d.error || "unknown error"}`);
      }
    } catch (err) {
      setMessage(`Reply failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    setReplying(false);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {message && (
        <div className="rounded-lg bg-success/10 px-4 py-2 text-xs text-success">{message}</div>
      )}

      {/* Summary bar */}
      {summary && (
        <div className="grid grid-cols-5 gap-3">
          <div className="rounded-xl border border-border bg-surface p-3 shadow-card">
            <p className="text-[10px] text-muted">30-day events</p>
            <p className="text-lg font-semibold">{summary.total_events}</p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-3 shadow-card">
            <p className="text-[10px] text-muted">Unreviewed</p>
            <p className="text-lg font-semibold">{summary.unreviewed}</p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-3 shadow-card">
            <p className="text-[10px] text-muted">Positive</p>
            <p className="text-lg font-semibold text-success">{summary.positive}</p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-3 shadow-card">
            <p className="text-[10px] text-muted">Negative</p>
            <p className="text-lg font-semibold text-danger">{summary.negative}</p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-3 shadow-card">
            <p className="text-[10px] text-muted">Neutral</p>
            <p className="text-lg font-semibold text-muted">{summary.neutral}</p>
          </div>
        </div>
      )}

      {/* Tabs + capture button */}
      <div className="flex items-center justify-between border-b border-border">
        <div className="flex gap-px">
          {(["inbox", "people", "activity"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                tab === t
                  ? "border-accent text-foreground"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              {t === "inbox" ? "Inbox" : t === "people" ? "People" : "Activity"}
            </button>
          ))}
        </div>
        <button
          onClick={runCapture}
          disabled={capturing}
          className="rounded border border-border px-3 py-1 text-[10px] font-medium text-muted hover:text-foreground hover:bg-surface-hover disabled:opacity-50 mb-1"
        >
          {capturing ? "Capturing..." : "Pull New Engagement"}
        </button>
      </div>

      {/* Inbox tab */}
      {tab === "inbox" && (
        <div className="rounded-xl border border-border bg-surface shadow-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-4 py-2">
            <span className="text-[10px] text-muted">
              {events.length} {showArchived ? "events (incl. archived)" : "active events"}
            </span>
            <label className="flex items-center gap-2 text-[10px] text-muted cursor-pointer">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={e => setShowArchived(e.target.checked)}
                className="h-3 w-3"
              />
              Show archived
            </label>
          </div>
          {events.length === 0 ? (
            <p className="p-6 text-center text-xs text-muted">
              {showArchived
                ? "No engagement events for this subscriber."
                : "No active engagement. Toggle 'Show archived' to see historical activity."}
            </p>
          ) : (
            <div className="divide-y divide-border">
              {events.map(e => (
                <div key={e.id} className="p-3 hover:bg-surface-hover">
                  <div className="flex items-start gap-3">
                    <div className="relative shrink-0">
                      {e.person_avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={e.person_avatar_url} alt="" referrerPolicy="no-referrer" className="w-12 h-12 rounded-full" />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-surface-hover flex items-center justify-center text-sm text-muted">
                          {(e.person_display_name || "?").charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span className="absolute bottom-0 right-0 translate-x-1/3 translate-y-1/3 rounded-md bg-surface p-px ring-2 ring-surface" title={PLATFORM_LABEL[e.platform] || e.platform}>
                        <PlatformIcon platform={e.platform} size={20} />
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-xs font-medium">{e.person_display_name || "Unknown"}</span>
                        {e.person_handle && (
                          <span className="text-[10px] text-muted">@{e.person_handle}</span>
                        )}
                        <span className="text-[10px] text-muted">{EVENT_TYPE_LABEL[e.event_type] || e.event_type}</span>
                        {e.event_type === "review" && e.star_rating && STAR_RATING_VALUE[e.star_rating] && (
                          <StarBar rating={STAR_RATING_VALUE[e.star_rating]} />
                        )}
                        {e.sentiment && (
                          <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${SENTIMENT_COLOR[e.sentiment]}`}>
                            {e.sentiment}
                          </span>
                        )}
                        <span className="text-[10px] text-muted ml-auto">{new Date(e.occurred_at).toLocaleString()}</span>
                      </div>
                      {e.body && (
                        <p className="mt-1 text-xs text-foreground leading-relaxed">{e.body}</p>
                      )}
                      <div className="mt-2 flex items-center gap-2 flex-wrap">
                        {e.permalink && (
                          <a href={e.permalink} target="_blank" rel="noopener noreferrer" className="text-[10px] text-accent hover:underline">
                            View on platform →
                          </a>
                        )}
                        {(e.platform === "gbp" || e.platform === "instagram" || e.platform === "facebook") && (
                          <button
                            onClick={() => { setReplyOpen(replyOpen === e.id ? null : e.id); setReplyText(""); }}
                            className="text-[10px] text-accent hover:underline"
                          >
                            {replyOpen === e.id ? "Cancel reply" : "Reply"}
                          </button>
                        )}
                        {e.review_status !== "reviewed" && (
                          <button
                            onClick={() => setStatus(e.id, "reviewed")}
                            className="text-[10px] text-muted hover:text-foreground"
                          >
                            Mark reviewed
                          </button>
                        )}
                        <button
                          onClick={() => setStatus(e.id, "archived")}
                          className="text-[10px] text-muted hover:text-foreground"
                        >
                          Archive
                        </button>
                        {(e.platform === "facebook" || e.platform === "instagram") && e.event_type === "comment" && (
                          <>
                            <button
                              onClick={() => moderate(e.id, "hide")}
                              className="text-[10px] text-muted hover:text-warning"
                              title="Hide this comment on the platform (visible only to commenter)"
                            >
                              Hide on platform
                            </button>
                            <button
                              onClick={() => moderate(e.id, "delete")}
                              className="text-[10px] text-muted hover:text-danger"
                              title="Delete this comment on the platform"
                            >
                              Delete on platform
                            </button>
                          </>
                        )}
                        {e.review_status === "reviewed" && (
                          <span className="rounded bg-success/10 text-success px-1.5 py-0.5 text-[9px] font-medium">Reviewed</span>
                        )}
                      </div>
                      {replyOpen === e.id && (
                        <div className="mt-2 flex gap-2">
                          <textarea
                            value={replyText}
                            onChange={ev => setReplyText(ev.target.value)}
                            placeholder={`Reply on ${PLATFORM_LABEL[e.platform] || e.platform}…`}
                            rows={2}
                            className="flex-1 rounded border border-border bg-background px-2 py-1.5 text-xs focus:border-accent focus:outline-none resize-y"
                          />
                          <button
                            onClick={() => sendReply(e.id)}
                            disabled={replying || !replyText.trim()}
                            className="rounded bg-accent px-3 py-1 text-[11px] font-medium text-white hover:bg-accent/90 disabled:opacity-50 self-start"
                          >
                            {replying ? "Sending…" : "Send"}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* People tab */}
      {tab === "people" && (
        <div className="rounded-xl border border-border bg-surface shadow-card overflow-hidden">
          {persons.length === 0 ? (
            <p className="p-6 text-center text-xs text-muted">No engaged persons yet.</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-surface-hover">
                <tr className="text-left">
                  <th className="w-10 px-2 py-2"></th>
                  <th className="px-4 py-2 font-medium text-muted">Person</th>
                  <th className="px-4 py-2 font-medium text-muted">Platforms</th>
                  <th className="px-4 py-2 font-medium text-muted text-right">Events</th>
                  <th className="px-4 py-2 font-medium text-muted text-right">Positive</th>
                  <th className="px-4 py-2 font-medium text-muted text-right">Negative</th>
                  <th className="px-4 py-2 font-medium text-muted">Last seen</th>
                  <th className="px-4 py-2 font-medium text-muted">Tags</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {persons.map(p => (
                  <tr key={p.id} className="hover:bg-surface-hover">
                    <td className="px-2 py-2">
                      {p.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.avatar_url} alt="" referrerPolicy="no-referrer" className="w-7 h-7 rounded-full" />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-surface-hover flex items-center justify-center text-[10px] text-muted">
                          {(p.display_name || "?").charAt(0).toUpperCase()}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2 font-medium">{p.display_name}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        {(p.handles || []).map((h, i) => (
                          <span key={i} className="inline-flex items-center gap-1 text-[10px] text-muted" title={PLATFORM_LABEL[h.platform] || h.platform}>
                            <PlatformIcon platform={h.platform} size={14} />
                            {h.handle ? `@${h.handle}` : ""}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right">{p.engagement_count}</td>
                    <td className="px-4 py-2 text-right text-success">{p.positive_engagements}</td>
                    <td className="px-4 py-2 text-right text-danger">{p.negative_engagements}</td>
                    <td className="px-4 py-2 text-[10px] text-muted">{new Date(p.last_seen_at).toLocaleDateString()}</td>
                    <td className="px-4 py-2 text-[10px]">
                      {p.is_advocate && <span className="rounded bg-success/10 text-success px-1.5 py-0.5 text-[9px] font-medium mr-1">Advocate</span>}
                      {p.is_influencer && <span className="rounded bg-accent/10 text-accent px-1.5 py-0.5 text-[9px] font-medium mr-1">Influencer</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Activity tab */}
      {tab === "activity" && summary && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
            <h3 className="text-sm font-medium mb-3">Engagement by platform (last 30 days)</h3>
            {summary.byPlatform.length === 0 ? (
              <p className="text-xs text-muted">No engagement yet.</p>
            ) : (
              <div className="space-y-2">
                {summary.byPlatform.map(p => (
                  <div key={p.platform} className="flex items-center gap-3">
                    <span className="text-xs font-medium w-48 shrink-0">{PLATFORM_LABEL[p.platform] || p.platform}</span>
                    <div className="flex-1 bg-surface-hover rounded h-6 overflow-hidden">
                      <div
                        className="h-full bg-accent flex items-center justify-end pr-2 text-[10px] text-white font-medium"
                        style={{ width: `${Math.min(100, (p.count / Math.max(...summary.byPlatform.map(x => x.count))) * 100)}%` }}
                      >
                        {p.count}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <ManagePage title="Engage">
      {({ subscriberId, siteId }) => <EngageContent subscriberId={subscriberId} siteId={siteId} />}
    </ManagePage>
  );
}
