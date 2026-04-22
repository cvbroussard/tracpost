"use client";

import { useEffect, useState } from "react";

interface Post {
  id: string;
  caption: string | null;
  status: string;
  scheduled_at: string | null;
  published_at: string | null;
  content_pillar: string | null;
  account_name: string;
  platform: string;
  platform_post_url: string | null;
  link_url: string | null;
  trigger_type: string | null;
}

export default function CalendarPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [vetoingId, setVetoingId] = useState<string | null>(null);
  const [activeSiteId, setActiveSiteId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((data) => {
        setActiveSiteId(data.activeSiteId);
        return fetchPosts(data.activeSiteId);
      })
      .catch(() => setLoading(false));
  }, []);

  async function fetchPosts(siteId: string) {
    try {
      const res = await fetch(`/api/calendar?site_id=${siteId}`);
      if (res.ok) {
        const data = await res.json();
        setPosts(data.posts);
      }
    } finally {
      setLoading(false);
    }
  }

  const [approvingId, setApprovingId] = useState<string | null>(null);

  async function approvePost(postId: string) {
    if (!activeSiteId) return;
    setApprovingId(postId);
    try {
      const res = await fetch("/api/posts/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ post_id: postId }),
      });
      if (res.ok) {
        setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, status: "scheduled" } : p)));
      }
    } finally {
      setApprovingId(null);
    }
  }

  async function vetoPost(postId: string) {
    if (!activeSiteId) return;
    setVetoingId(postId);
    try {
      const res = await fetch("/api/posts/veto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ post_id: postId, reason: "Vetoed from calendar" }),
      });
      if (res.ok) {
        setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, status: "vetoed" } : p)));
      }
    } finally {
      setVetoingId(null);
    }
  }

  const drafts = posts.filter((p) => p.status === "draft");
  const scheduled = posts.filter((p) => p.status === "scheduled");
  const published = posts.filter((p) => p.status === "published");
  const vetoed = posts.filter((p) => p.status === "vetoed");

  return (
    <div className="p-4 space-y-6">
      <h1 className="mb-1 text-lg font-semibold">Content Calendar</h1>
      <p className="mb-8 text-sm text-muted">Review scheduled posts and veto before they publish</p>

      {loading ? (
        <p className="py-12 text-center text-sm text-muted">Loading...</p>
      ) : (
        <>
          {/* Drafts — awaiting review */}
          {drafts.length > 0 && (
            <section className="mb-8">
              <h2 className="mb-3 text-sm font-medium text-warning">Drafts — Awaiting Review ({drafts.length})</h2>
              <div className="space-y-3">
                {drafts.map((post) => {
                  const isExpanded = expanded === post.id;
                  return (
                    <div key={post.id} className="rounded-lg border border-warning/30 bg-surface">
                      <div className="flex items-start justify-between p-4">
                        <button
                          onClick={() => setExpanded(isExpanded ? null : post.id)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <div className="flex items-center gap-2">
                            <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                              {post.platform}
                            </span>
                            {post.trigger_type === "blog_publish" && (
                              <span className="rounded bg-success/10 px-1.5 py-0.5 text-[10px] text-success">
                                blog promo
                              </span>
                            )}
                            <span className="rounded bg-warning/10 px-1.5 py-0.5 text-[10px] text-warning">
                              draft
                            </span>
                          </div>
                          <p className={`mt-1 text-sm ${isExpanded ? "" : "truncate"}`}>
                            {post.caption || "Awaiting caption"}
                          </p>
                          <p className="mt-0.5 text-xs text-muted">{post.account_name}</p>
                        </button>
                        <div className="ml-4 flex shrink-0 gap-2">
                          <button
                            onClick={() => approvePost(post.id)}
                            disabled={approvingId === post.id}
                            className="rounded bg-success px-3 py-1.5 text-xs font-medium text-white hover:bg-success/90 disabled:opacity-50"
                          >
                            {approvingId === post.id ? "..." : "Approve"}
                          </button>
                          <button
                            onClick={() => vetoPost(post.id)}
                            disabled={vetoingId === post.id}
                            className="rounded border border-danger/30 px-3 py-1.5 text-xs text-danger hover:bg-danger/10 disabled:opacity-50"
                          >
                            {vetoingId === post.id ? "..." : "Veto"}
                          </button>
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="border-t border-border px-4 py-3">
                          <div className="whitespace-pre-wrap text-sm">{post.caption}</div>
                          {post.link_url && (
                            <a href={post.link_url} target="_blank" rel="noopener noreferrer" className="mt-2 block text-xs text-accent hover:underline">
                              {post.link_url}
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <section className="mb-8">
            <h2 className="mb-3 text-sm font-medium">Scheduled ({scheduled.length})</h2>
            {scheduled.length > 0 ? (
              <div className="space-y-3">
                {scheduled.map((post) => {
                  const isExpanded = expanded === post.id;
                  return (
                    <div key={post.id} className="rounded-lg border border-border bg-surface">
                      <div className="flex items-start justify-between p-4">
                        <button
                          onClick={() => setExpanded(isExpanded ? null : post.id)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <div className="flex items-center gap-2">
                            <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                              {post.platform}
                            </span>
                            {post.trigger_type === "blog_publish" && (
                              <span className="rounded bg-success/10 px-1.5 py-0.5 text-[10px] text-success">
                                blog promo
                              </span>
                            )}
                            <span className="text-[10px] text-muted">
                              {post.scheduled_at ? new Date(post.scheduled_at).toLocaleString() : "—"}
                            </span>
                          </div>
                          <p className={`mt-1 text-sm ${isExpanded ? "" : "truncate"}`}>
                            {post.caption || "Awaiting caption"}
                          </p>
                          <p className="mt-0.5 text-xs text-muted">
                            {post.account_name}
                            {post.content_pillar && ` — ${post.content_pillar}`}
                          </p>
                        </button>
                        <button
                          onClick={() => vetoPost(post.id)}
                          disabled={vetoingId === post.id}
                          className="ml-4 shrink-0 rounded border border-danger/30 px-3 py-1.5 text-xs text-danger transition-colors hover:bg-danger/10 disabled:opacity-50"
                        >
                          {vetoingId === post.id ? "..." : "Veto"}
                        </button>
                      </div>
                      {isExpanded && (
                        <div className="border-t border-border px-4 py-3">
                          <div className="whitespace-pre-wrap text-sm">{post.caption}</div>
                          {post.link_url && (
                            <a href={post.link_url} target="_blank" rel="noopener noreferrer" className="mt-2 block text-xs text-accent hover:underline">
                              {post.link_url}
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-muted">No scheduled posts</p>
            )}
          </section>

          {published.length > 0 && (
            <section className="mb-8">
              <h2 className="mb-3 text-sm font-medium text-success">Published ({published.length})</h2>
              <div className="space-y-2">
                {published.map((post) => (
                  <div key={post.id} className="rounded-lg border border-border bg-surface p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        {post.platform_post_url ? (
                          <a href={post.platform_post_url} target="_blank" rel="noopener noreferrer" className="text-sm text-accent hover:underline">
                            {post.caption || "—"}
                          </a>
                        ) : (
                          <p className="text-sm">{post.caption || "—"}</p>
                        )}
                        <p className="mt-1 text-xs text-muted">{post.account_name} ({post.platform})</p>
                      </div>
                      <span className="text-xs text-muted">
                        {post.published_at ? new Date(post.published_at).toLocaleString() : ""}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {vetoed.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-medium text-muted">Vetoed ({vetoed.length})</h2>
              <div className="space-y-2">
                {vetoed.map((post) => (
                  <div key={post.id} className="rounded-lg border border-border bg-surface p-4 opacity-60">
                    <p className="text-sm line-through">{post.caption || "—"}</p>
                    <p className="mt-1 text-xs text-muted">{post.account_name} ({post.platform})</p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
