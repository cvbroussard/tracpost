"use client";

import { useState, useEffect, useCallback } from "react";
import { ManagePage } from "@/components/manage/manage-page";
import { PlatformIcon } from "@/components/platform-icon";
import { confirm, toast } from "@/components/feedback";

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
  sentiment_rationale: string | null;
  appeal_submitted_at: string | null;
  is_spam: boolean | null;
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
  primary_platform: string | null;
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
  const [showSpam, setShowSpam] = useState(false);
  const [appealEvent, setAppealEvent] = useState<Event | null>(null);
  const [appealDraft, setAppealDraft] = useState<{ hasViolation: boolean; category: string | null; rationale: string; appealText: string; evidenceSuggestions: string[]; googleFormUrl: string } | null>(null);
  const [appealLoading, setAppealLoading] = useState(false);
  const [editedAppeal, setEditedAppeal] = useState("");

  const load = useCallback(() => {
    const siteParam = siteId !== "all" ? `&site_id=${siteId}` : "";
    const archivedParam = showArchived ? "&include_archived=true" : "";
    const spamParam = showSpam ? "&include_spam=true" : "";
    fetch(`/api/admin/engage?subscription_id=${subscriberId}${siteParam}${archivedParam}${spamParam}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return;
        setEvents(d.events || []);
        setPersons(d.persons || []);
        setSummary(d.summary || null);
      })
      .finally(() => setLoading(false));
  }, [subscriberId, siteId, showArchived, showSpam]);

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

  async function openAppeal(e: Event) {
    setAppealEvent(e);
    setAppealDraft(null);
    setEditedAppeal("");
    setAppealLoading(true);
    try {
      const res = await fetch("/api/admin/engage/appeal-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: e.id }),
      });
      const d = await res.json();
      if (res.ok) {
        setAppealDraft(d);
        setEditedAppeal(d.appealText || "");
      } else {
        setMessage(`Draft failed: ${d.error || "unknown error"}`);
        setAppealEvent(null);
      }
    } catch (err) {
      setMessage(`Draft failed: ${err instanceof Error ? err.message : String(err)}`);
      setAppealEvent(null);
    }
    setAppealLoading(false);
  }

  async function markAppealSubmitted() {
    if (!appealEvent || !appealDraft) return;
    await fetch("/api/admin/engage/appeal-submitted", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId: appealEvent.id,
        category: appealDraft.category,
        draft: editedAppeal,
      }),
    });
    setMessage("Appeal logged. Watch the inbox — if Google removes the review, it'll disappear on the next capture.");
    setEvents(prev => prev.map(e => e.id === appealEvent.id ? { ...e, appeal_submitted_at: new Date().toISOString() } : e));
    setAppealEvent(null);
    setAppealDraft(null);
  }

  async function markSpam(eventId: string, action: "mark" | "unmark") {
    if (action === "mark") {
      const ok = await confirm({
        title: "Mark as spam?",
        body: "This will hide the comment on the platform (if applicable), archive it locally, and flag it as spam. Spammer is not notified.",
        confirmLabel: "Mark as spam",
        danger: true,
      });
      if (!ok) return;
    }
    const res = await fetch("/api/admin/engage/mark-spam", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId, action }),
    });
    const d = await res.json();
    if (res.ok) {
      if (action === "mark") {
        const platformNote = d.hidOnPlatform ? " · hidden on platform" : d.hideError ? ` · platform hide failed (${d.hideError})` : "";
        toast.success(`Marked as spam${platformNote}`);
        setEvents(prev => showSpam
          ? prev.map(e => e.id === eventId ? { ...e, is_spam: true, review_status: "archived" } : e)
          : prev.filter(e => e.id !== eventId));
      } else {
        toast.success("Spam mark removed");
        setEvents(prev => prev.map(e => e.id === eventId ? { ...e, is_spam: false, review_status: "new" } : e));
      }
    } else {
      toast.error(`Failed: ${d.error || "unknown error"}`);
    }
  }

  async function moderate(eventId: string, action: "hide" | "delete") {
    const ok = await confirm({
      title: action === "hide" ? "Hide this comment on the platform?" : "Delete this comment on the platform?",
      body: action === "delete" ? "This cannot be undone." : undefined,
      confirmLabel: action === "hide" ? "Hide" : "Delete",
      danger: action === "delete",
    });
    if (!ok) return;
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
              {events.length} {showArchived || showSpam ? "events" : "active events"}
              {showArchived ? " · incl. archived" : ""}
              {showSpam ? " · incl. spam" : ""}
            </span>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-[10px] text-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={e => setShowArchived(e.target.checked)}
                  className="h-3 w-3"
                />
                Show archived
              </label>
              <label className="flex items-center gap-2 text-[10px] text-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={showSpam}
                  onChange={e => setShowSpam(e.target.checked)}
                  className="h-3 w-3"
                />
                Show spam
              </label>
            </div>
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
                      <span className="absolute bottom-0 right-0 translate-x-1/3 translate-y-1/3 rounded-md ring-2 ring-surface inline-block leading-none" title={PLATFORM_LABEL[e.platform] || e.platform}>
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
                          <span
                            className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${SENTIMENT_COLOR[e.sentiment]}`}
                            title={e.sentiment_rationale || undefined}
                          >
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
                        {!e.is_spam && e.event_type !== "review" && (
                          <button
                            onClick={() => markSpam(e.id, "mark")}
                            className="text-[10px] text-muted hover:text-danger"
                            title="Mark as spam — hides on platform when applicable, archives locally, retains for pattern detection"
                          >
                            Mark as spam
                          </button>
                        )}
                        {e.is_spam && (
                          <>
                            <span className="rounded bg-danger/10 text-danger px-1.5 py-0.5 text-[9px] font-medium" title="Marked as spam">
                              Spam
                            </span>
                            <button
                              onClick={() => markSpam(e.id, "unmark")}
                              className="text-[10px] text-muted hover:text-foreground"
                              title="Remove the spam flag (does not un-hide on the platform)"
                            >
                              Not spam
                            </button>
                          </>
                        )}
                        {e.platform === "gbp" && e.event_type === "review" && (e.sentiment === "negative" || (e.star_rating && STAR_RATING_VALUE[e.star_rating] <= 2)) && !e.appeal_submitted_at && (
                          <button
                            onClick={() => openAppeal(e)}
                            className="text-[10px] text-warning hover:underline"
                            title="Draft a Google appeal — TracPost will assess if the review violates Google policy and prepare the submission text"
                          >
                            Appeal to Google
                          </button>
                        )}
                        {e.appeal_submitted_at && (
                          <span className="rounded bg-warning/10 text-warning px-1.5 py-0.5 text-[9px] font-medium" title={`Appeal submitted ${new Date(e.appeal_submitted_at).toLocaleString()}`}>
                            Appeal submitted
                          </span>
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
                  <th className="w-16 px-3 py-2"></th>
                  <th className="px-4 py-2 font-medium text-muted">Person</th>
                  <th className="px-4 py-2 font-medium text-muted text-right">Events</th>
                  <th className="px-4 py-2 font-medium text-muted text-right">Positive</th>
                  <th className="px-4 py-2 font-medium text-muted text-right">Negative</th>
                  <th className="px-4 py-2 font-medium text-muted">Last seen</th>
                  <th className="px-4 py-2 font-medium text-muted">Tags</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {persons.map(p => {
                  const badgePlatform = p.primary_platform || p.handles?.[0]?.platform || null;
                  return (
                    <tr key={p.id} className="hover:bg-surface-hover">
                      <td className="px-3 py-2">
                        <div className="relative inline-block">
                          {p.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.avatar_url} alt="" referrerPolicy="no-referrer" className="w-12 h-12 rounded-full" />
                          ) : (
                            <div className="w-12 h-12 rounded-full bg-surface-hover flex items-center justify-center text-sm text-muted">
                              {(p.display_name || "?").charAt(0).toUpperCase()}
                            </div>
                          )}
                          {badgePlatform && (
                            <span className="absolute bottom-0 right-0 translate-x-1/3 translate-y-1/3 rounded-md ring-2 ring-surface inline-block leading-none" title={PLATFORM_LABEL[badgePlatform] || badgePlatform}>
                              <PlatformIcon platform={badgePlatform} size={20} />
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2 font-medium">{p.display_name}</td>
                      <td className="px-4 py-2 text-right">{p.engagement_count}</td>
                      <td className="px-4 py-2 text-right text-success">{p.positive_engagements}</td>
                      <td className="px-4 py-2 text-right text-danger">{p.negative_engagements}</td>
                      <td className="px-4 py-2 text-[10px] text-muted">{new Date(p.last_seen_at).toLocaleDateString()}</td>
                      <td className="px-4 py-2 text-[10px]">
                        {p.is_advocate && <span className="rounded bg-success/10 text-success px-1.5 py-0.5 text-[9px] font-medium mr-1">Advocate</span>}
                        {p.is_influencer && <span className="rounded bg-accent/10 text-accent px-1.5 py-0.5 text-[9px] font-medium mr-1">Influencer</span>}
                      </td>
                    </tr>
                  );
                })}
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

      {/* Appeal modal */}
      {appealEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => { setAppealEvent(null); setAppealDraft(null); }}>
          <div className="max-w-2xl w-full max-h-[90vh] overflow-y-auto rounded-xl bg-surface shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="border-b border-border px-5 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold">Appeal Google Review</h2>
                <p className="text-[11px] text-muted mt-0.5">From {appealEvent.person_display_name || "Unknown"}</p>
              </div>
              <button onClick={() => { setAppealEvent(null); setAppealDraft(null); }} className="text-muted hover:text-foreground text-xl leading-none">×</button>
            </div>
            <div className="p-5 space-y-4">
              <div className="rounded-lg bg-surface-hover p-3 text-xs italic text-foreground border-l-2 border-border">
                &ldquo;{appealEvent.body}&rdquo;
              </div>

              {appealLoading && (
                <div className="flex items-center gap-2 text-xs text-muted py-4">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                  Analyzing review against Google policy…
                </div>
              )}

              {appealDraft && !appealDraft.hasViolation && (
                <div className="rounded-lg border border-border bg-surface-hover p-4">
                  <p className="text-xs font-medium mb-1">No clear policy violation</p>
                  <p className="text-[11px] text-muted">{appealDraft.rationale}</p>
                  <p className="text-[11px] text-muted mt-2">A negative-but-civil review of actual service is not removable. The strongest move here is a thoughtful public reply.</p>
                </div>
              )}

              {appealDraft && appealDraft.hasViolation && (
                <>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted mb-1">Suggested category</p>
                    <p className="text-xs font-medium">{appealDraft.category}</p>
                    <p className="text-[11px] text-muted mt-1">{appealDraft.rationale}</p>
                  </div>

                  {/* First attempt: inline flag in GBP dashboard */}
                  <div className="rounded-lg border-2 border-warning/40 bg-warning/5 p-4">
                    <p className="text-xs font-semibold text-foreground mb-1">Step 1 — Try the inline flag first (faster)</p>
                    <p className="text-[11px] text-muted leading-relaxed mb-3">
                      Google&apos;s 3-dot &ldquo;Flag as inappropriate&rdquo; option in your dashboard goes through their automated detection. Many removals happen here without ever needing the support form. Try this before the form below.
                    </p>
                    <a
                      href="https://business.google.com/reviews"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block rounded bg-warning text-white px-3 py-1.5 text-[11px] font-medium hover:opacity-90"
                    >
                      Open GBP Reviews dashboard →
                    </a>
                  </div>

                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted mb-1">Step 2 — Appeal text (if Step 1 was denied)</p>
                    <textarea
                      value={editedAppeal}
                      onChange={ev => setEditedAppeal(ev.target.value)}
                      rows={6}
                      className="w-full rounded border border-border bg-background px-3 py-2 text-xs leading-relaxed focus:border-accent focus:outline-none resize-y"
                    />
                  </div>

                  {appealDraft.evidenceSuggestions.length > 0 && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-muted mb-1">Evidence to gather</p>
                      <ul className="text-[11px] text-foreground space-y-1 pl-4 list-disc">
                        {appealDraft.evidenceSuggestions.map((s, i) => <li key={i}>{s}</li>)}
                      </ul>
                    </div>
                  )}

                  {/* Granular copy buttons — these populate the support form's individual fields */}
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted mb-2">Quick-copy fields for the form</p>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => { navigator.clipboard.writeText(appealEvent.body || ""); setMessage("Review text copied"); }}
                        className="rounded border border-border px-2.5 py-1 text-[10px] font-medium hover:bg-surface-hover"
                      >
                        📋 Review excerpt
                      </button>
                      <button
                        onClick={() => { navigator.clipboard.writeText(appealEvent.person_display_name || ""); setMessage("Reviewer name copied"); }}
                        className="rounded border border-border px-2.5 py-1 text-[10px] font-medium hover:bg-surface-hover"
                      >
                        📋 Reviewer name
                      </button>
                      <button
                        onClick={() => { navigator.clipboard.writeText(new Date(appealEvent.occurred_at).toLocaleDateString()); setMessage("Review date copied"); }}
                        className="rounded border border-border px-2.5 py-1 text-[10px] font-medium hover:bg-surface-hover"
                      >
                        📋 Review date
                      </button>
                      <button
                        onClick={() => { navigator.clipboard.writeText(appealDraft.category || ""); setMessage("Category copied"); }}
                        className="rounded border border-border px-2.5 py-1 text-[10px] font-medium hover:bg-surface-hover"
                      >
                        📋 Policy category
                      </button>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border bg-surface-hover p-3 text-[11px] text-muted">
                    <p className="font-medium text-foreground mb-1">Submit the form</p>
                    <ol className="space-y-1 list-decimal pl-4">
                      <li>Click &ldquo;Copy appeal text&rdquo; below.</li>
                      <li>Click &ldquo;Open Google form&rdquo; — sign in with the GBP-owner account.</li>
                      <li>Use the quick-copy buttons above to paste each field as you walk through the wizard.</li>
                      <li>Click &ldquo;Mark as submitted&rdquo; here so we can track the outcome.</li>
                    </ol>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                    <button
                      onClick={() => { navigator.clipboard.writeText(editedAppeal); setMessage("Appeal text copied"); }}
                      className="rounded border border-border px-3 py-1.5 text-[11px] font-medium hover:bg-surface-hover"
                    >
                      Copy appeal text
                    </button>
                    <a
                      href={appealDraft.googleFormUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded border border-border px-3 py-1.5 text-[11px] font-medium hover:bg-surface-hover"
                    >
                      Open Google form →
                    </a>
                    <button
                      onClick={markAppealSubmitted}
                      className="rounded bg-warning text-white px-3 py-1.5 text-[11px] font-medium hover:opacity-90 ml-auto"
                    >
                      Mark as submitted
                    </button>
                  </div>
                </>
              )}
            </div>
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
