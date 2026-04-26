"use client";

import { useState, useEffect } from "react";
import { toast } from "@/components/feedback";
import { ManagePage } from "@/components/manage/manage-page";

function BlogContent({ siteId }: { siteId: string }) {
  const [generatingEditorial, setGeneratingEditorial] = useState(false);
  const [generatingProject, setGeneratingProject] = useState(false);
  const [selectedProject, setSelectedProject] = useState("");
  const [projects, setProjects] = useState<Array<{ id: string; name: string; promptCount: number }>>([]);
  const [recentArticles, setRecentArticles] = useState<Array<{ title: string; status: string; published_at: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState({ published: 0, draft: 0, total: 0 });
  const [projectPrompts, setProjectPrompts] = useState<Array<{ title: string; angle: string }> | null>(null);
  const [loadingPrompts, setLoadingPrompts] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/manage/site?site_id=${siteId}&view=overview`).then(r => r.ok ? r.json() : null),
      fetch(`/api/manage/blog?site_id=${siteId}`).then(r => r.ok ? r.json() : { articles: [], projects: [] }),
    ])
      .then(([overview, blog]) => {
        if (overview?.counts) {
          setCounts({
            published: overview.counts.published_posts || 0,
            draft: overview.counts.draft_posts || 0,
            total: overview.counts.total_posts || 0,
          });
        }
        setRecentArticles(blog.articles || []);
        setProjects(blog.projects || []);
        if (blog.projects?.length > 0) setSelectedProject(blog.projects[0].id);
      })
      .finally(() => setLoading(false));
  }, [siteId]);

  async function generateEditorial() {
    setGeneratingEditorial(true);
    try {
      const res = await fetch(`/api/blog?site_id=${siteId}&action=generate`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Article created: "${data.title || "New article"}"`);
        window.location.reload();
      } else {
        toast.error(data.error || "Generation failed");
      }
    } catch { toast.error("Request failed"); }
    setGeneratingEditorial(false);
  }

  async function generateProject() {
    if (!selectedProject) return;
    setGeneratingProject(true);
    try {
      const res = await fetch(`/api/projects/${selectedProject}/generate-article`, { method: "POST" });
      const data = await res.json();
      if (res.ok && data.status === "prompts_generated") {
        const res2 = await fetch(`/api/projects/${selectedProject}/generate-article`, { method: "POST" });
        const data2 = await res2.json();
        if (res2.ok && data2.article) {
          toast.success(`Article created: "${data2.article.title}"`);
          window.location.reload();
        } else {
          toast.error(data2.error || "Generation failed");
        }
      } else if (res.ok && data.article) {
        toast.success(`Article created: "${data.article.title}"`);
        window.location.reload();
      } else {
        toast.error(data.error || "Generation failed");
      }
    } catch { toast.error("Request failed"); }
    setGeneratingProject(false);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-4 grid grid-cols-2 gap-4">
      {/* Left column */}
      <div className="space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-border bg-surface-hover p-3 text-center">
            <p className="text-lg font-semibold text-success">{counts.published}</p>
            <p className="text-[10px] text-muted">Published</p>
          </div>
          <div className="rounded-lg border border-border bg-surface-hover p-3 text-center">
            <p className="text-lg font-semibold">{counts.draft}</p>
            <p className="text-[10px] text-muted">Drafts</p>
          </div>
          <div className="rounded-lg border border-border bg-surface-hover p-3 text-center">
            <p className="text-lg font-semibold">{counts.total}</p>
            <p className="text-[10px] text-muted">Total</p>
          </div>
        </div>

        {/* Editorial generation */}
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <h3 className="text-sm font-medium mb-1">Editorial Article</h3>
          <p className="text-[10px] text-muted mb-3">
            Generate an authority article from reward prompts.
          </p>
          <button
            onClick={generateEditorial}
            disabled={generatingEditorial}
            className="bg-accent px-4 py-1.5 text-xs font-medium text-white rounded hover:bg-accent-hover disabled:opacity-50"
          >
            {generatingEditorial ? "Writing..." : "Write Editorial Article"}
          </button>
        </div>

        {/* Project generation */}
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <h3 className="text-sm font-medium mb-1">Project Article</h3>
          <p className="text-[10px] text-muted mb-3">
            Generate from a project&apos;s captioned assets ({projects.length} projects, {projects.reduce((s, p) => s + p.promptCount, 0)} prompts).
          </p>
          {projects.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <select
                  value={selectedProject}
                  onChange={e => { setSelectedProject(e.target.value); setProjectPrompts(null); }}
                  className="rounded border border-border bg-background px-2 py-1 text-xs flex-1"
                >
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <button
                  onClick={generateProject}
                  disabled={generatingProject}
                  className="bg-accent px-3 py-1 text-xs font-medium text-white rounded hover:bg-accent-hover disabled:opacity-50"
                >
                  {generatingProject ? "Writing..." : "Write"}
                </button>
              </div>
              <button
                onClick={async () => {
                  if (!selectedProject) return;
                  setLoadingPrompts(true);
                  try {
                    const res = await fetch(`/api/projects/${selectedProject}/generate-article`);
                    if (res.ok) {
                      const data = await res.json();
                      setProjectPrompts(data.prompts || []);
                    }
                  } catch { /* ignore */ }
                  setLoadingPrompts(false);
                }}
                disabled={loadingPrompts}
                className="text-[10px] text-accent hover:underline disabled:opacity-50"
              >
                {loadingPrompts ? "Loading..." : "View prompts"}
              </button>

              {projectPrompts && (
                <div className="rounded border border-border bg-background p-2 mt-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-medium">{projectPrompts.length} article angles</span>
                    <button onClick={() => setProjectPrompts(null)} className="text-[10px] text-muted hover:text-foreground">Close</button>
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1.5">
                    {projectPrompts.map((p, i) => (
                      <div key={i} className="border-b border-border pb-1.5 last:border-0">
                        <p className="text-[10px] font-medium">{p.title}</p>
                        <p className="text-[9px] text-muted">{p.angle}</p>
                      </div>
                    ))}
                    {projectPrompts.length === 0 && (
                      <p className="text-[10px] text-muted">No prompts yet — click Write to generate them.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-[10px] text-muted">No projects configured.</p>
          )}
        </div>
      </div>

      {/* Right column — recent articles */}
      <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
        <h3 className="text-sm font-medium mb-3">Recent Articles</h3>
        {recentArticles.length > 0 ? (
          <div className="space-y-1.5">
            {recentArticles.map((a, i) => (
              <div key={i} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                <p className="text-xs truncate flex-1 mr-2">{a.title}</p>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${
                    a.status === "published" ? "bg-success/10 text-success" : "bg-muted/10 text-muted"
                  }`}>{a.status}</span>
                  {a.published_at && (
                    <span className="text-[9px] text-muted">
                      {new Date(a.published_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[10px] text-muted">No articles yet.</p>
        )}
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <ManagePage title="Blog" requireSite>
      {({ siteId }) => <BlogContent siteId={siteId} />}
    </ManagePage>
  );
}
