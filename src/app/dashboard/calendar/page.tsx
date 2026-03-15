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
}

interface SessionInfo {
  apiKey: string;
  activeSiteId: string;
}

export default function CalendarPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [vetoingId, setVetoingId] = useState<string | null>(null);
  const [session, setSession] = useState<SessionInfo | null>(null);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((data) => {
        setSession({ apiKey: data.apiKey, activeSiteId: data.activeSiteId });
        return fetchPosts(data.apiKey, data.activeSiteId);
      })
      .catch(() => setLoading(false));
  }, []);

  async function fetchPosts(apiKey: string, siteId: string) {
    try {
      const res = await fetch(`/api/calendar?site_id=${siteId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPosts(data.posts);
      }
    } finally {
      setLoading(false);
    }
  }

  async function vetoPost(postId: string) {
    if (!session) return;
    setVetoingId(postId);
    try {
      const res = await fetch("/api/posts/veto", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.apiKey}`,
        },
        body: JSON.stringify({ post_id: postId, reason: "Vetoed from calendar" }),
      });
      if (res.ok) {
        setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, status: "vetoed" } : p)));
      }
    } finally {
      setVetoingId(null);
    }
  }

  const scheduled = posts.filter((p) => p.status === "scheduled");
  const published = posts.filter((p) => p.status === "published");
  const vetoed = posts.filter((p) => p.status === "vetoed");

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-1 text-lg font-semibold">Content Calendar</h1>
      <p className="mb-8 text-sm text-muted">Review scheduled posts and veto before they publish</p>

      {loading ? (
        <p className="py-12 text-center text-sm text-muted">Loading...</p>
      ) : (
        <>
          <section className="mb-8">
            <h2 className="mb-3 text-sm font-medium">Scheduled ({scheduled.length})</h2>
            {scheduled.length > 0 ? (
              <div className="space-y-3">
                {scheduled.map((post) => (
                  <div key={post.id} className="rounded-lg border border-border bg-surface p-4">
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm">{post.caption || "Awaiting caption"}</p>
                        <p className="mt-1 text-xs text-muted">
                          {post.account_name} ({post.platform})
                          {post.content_pillar && ` — ${post.content_pillar}`}
                        </p>
                        <p className="mt-0.5 text-xs text-muted">
                          {post.scheduled_at ? new Date(post.scheduled_at).toLocaleString() : "—"}
                        </p>
                      </div>
                      <button
                        onClick={() => vetoPost(post.id)}
                        disabled={vetoingId === post.id}
                        className="ml-4 shrink-0 rounded border border-danger/30 px-3 py-1.5 text-xs text-danger transition-colors hover:bg-danger/10 disabled:opacity-50"
                      >
                        {vetoingId === post.id ? "..." : "Veto"}
                      </button>
                    </div>
                  </div>
                ))}
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
