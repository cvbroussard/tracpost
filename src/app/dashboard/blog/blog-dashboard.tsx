"use client";

import { useState } from "react";
import { BlogImport } from "./blog-import";

interface Settings {
  blog_enabled: boolean;
  subdomain: string | null;
  custom_domain: string | null;
  blog_title: string | null;
  blog_description: string | null;
}

interface Post {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  body: string | null;
  og_image_url: string | null;
  status: string;
  content_type: string | null;
  content_pillar: string | null;
  metadata: Record<string, unknown> | null;
  published_at: string | null;
  created_at: string;
}

export function BlogDashboard({
  siteId,
  initialSettings,
  initialPosts,
}: {
  siteId: string;
  initialSettings: Settings;
  initialPosts: Post[];
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [posts, setPosts] = useState(initialPosts);
  const [saving, setSaving] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [title, setTitle] = useState(settings.blog_title || "");
  const [description, setDescription] = useState(settings.blog_description || "");
  const [subdomain, setSubdomain] = useState(settings.subdomain || "");

  async function saveSettings(enabled?: boolean) {
    setSaving(true);
    try {
      await fetch("/api/blog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "settings",
          site_id: siteId,
          blog_enabled: enabled ?? settings.blog_enabled,
          blog_title: title || null,
          blog_description: description || null,
          subdomain: subdomain || null,
        }),
      });
      setSettings((s) => ({
        ...s,
        blog_enabled: enabled ?? s.blog_enabled,
        blog_title: title || null,
        blog_description: description || null,
        subdomain: subdomain || null,
      }));
    } catch {
      alert("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  async function togglePost(postId: string, currentStatus: string) {
    const action = currentStatus === "published" ? "unpublish" : "publish";
    try {
      await fetch("/api/blog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, post_id: postId }),
      });
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? {
                ...p,
                status: action === "publish" ? "published" : "draft",
                published_at: action === "publish" ? new Date().toISOString() : p.published_at,
              }
            : p
        )
      );
    } catch {
      alert("Failed to update post");
    }
  }

  return (
    <>
      {/* Settings card */}
      <div className="mb-8 rounded-lg border border-border bg-surface p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium">Blog Settings</h2>
          <button
            onClick={() => saveSettings(!settings.blog_enabled)}
            className={`rounded-full px-4 py-1.5 text-xs font-medium ${
              settings.blog_enabled
                ? "bg-success/20 text-success"
                : "bg-surface-hover text-muted"
            }`}
          >
            {settings.blog_enabled ? "Enabled" : "Disabled"}
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-muted">Blog Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
              placeholder="My Blog"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">Subdomain</label>
            <input
              value={subdomain}
              onChange={(e) => setSubdomain(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
              placeholder="blog.hektork9.com"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-muted">Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
              placeholder="Latest updates and insights"
            />
          </div>
        </div>

        <button
          onClick={() => saveSettings()}
          disabled={saving}
          className="mt-4 rounded-lg bg-accent px-4 py-2 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </div>

      {/* Import section */}
      {showImport ? (
        <div className="mb-8">
          <BlogImport
            siteId={siteId}
            subdomain={settings.subdomain}
            onComplete={() => {
              setShowImport(false);
              window.location.reload();
            }}
          />
        </div>
      ) : (
        <div className="mb-8">
          <button
            onClick={() => setShowImport(true)}
            className="rounded-lg border border-dashed border-accent/40 px-4 py-2 text-xs font-medium text-accent hover:border-accent hover:bg-accent/10"
          >
            Import Existing Blog
          </button>
        </div>
      )}

      {/* Posts list */}
      <h2 className="mb-3 text-sm font-medium">Blog Articles</h2>
      {posts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-8 py-12 text-center">
          <p className="text-sm text-muted">
            {settings.blog_enabled
              ? "Blog posts will appear here as the pipeline processes your uploads."
              : "Enable the blog above to start generating posts."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => {
            const isExpanded = expanded === post.id;
            return (
              <div
                key={post.id}
                className="rounded-lg border border-border bg-surface"
              >
                <div className="flex items-center gap-4 p-4">
                  {post.og_image_url && (
                    <img
                      src={post.og_image_url}
                      alt=""
                      className="h-14 w-14 shrink-0 rounded-lg object-cover"
                    />
                  )}
                  <button
                    onClick={() => setExpanded(isExpanded ? null : post.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="truncate text-sm font-medium">{post.title}</p>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                          post.status === "published"
                            ? "bg-success/20 text-success"
                            : post.status === "flagged"
                            ? "bg-danger/20 text-danger"
                            : "bg-muted/20 text-muted"
                        }`}
                      >
                        {post.status}
                      </span>
                      {post.content_type && (
                        <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">
                          {post.content_type.replace(/_/g, " ")}
                        </span>
                      )}
                      <span>{new Date(post.created_at).toLocaleDateString()}</span>
                      {post.content_pillar && (
                        <span className="rounded bg-surface-hover px-1.5 py-0.5">{post.content_pillar}</span>
                      )}
                    </div>
                  </button>
                  <button
                    onClick={() => togglePost(post.id, post.status)}
                    className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:border-accent hover:text-foreground"
                  >
                    {post.status === "published" ? "Unpublish" : "Publish"}
                  </button>
                </div>

                {isExpanded && post.body && (
                  <div className="border-t border-border px-4 py-4">
                    {post.status === "flagged" && Array.isArray((post.metadata as Record<string, unknown>)?.guard_flags) && (
                      <div className="mb-3 rounded bg-danger/10 px-3 py-2">
                        <p className="mb-1 text-xs font-medium text-danger">Content flagged:</p>
                        {((post.metadata as Record<string, unknown>).guard_flags as string[]).map((flag, i) => (
                          <p key={i} className="text-xs text-danger/80">- {flag}</p>
                        ))}
                      </div>
                    )}
                    {post.excerpt && (
                      <p className="mb-3 text-sm italic text-muted">{post.excerpt}</p>
                    )}
                    <div
                      className="prose prose-sm max-w-none text-foreground prose-headings:text-foreground prose-a:text-accent"
                      dangerouslySetInnerHTML={{ __html: post.body }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
