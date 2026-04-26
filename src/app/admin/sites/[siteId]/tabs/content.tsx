"use client";

import { useState } from "react";
import { toast } from "@/components/feedback";
import { CorrectionsPanel } from "../website-pane";
import type { SiteData, Counts, RewardPrompt, ProjectInfo } from "../site-tabs";

export function ContentTab({
  siteId,
  site,
  counts,
  rewardPrompts,
  projects,
}: {
  siteId: string;
  site: SiteData;
  counts: Counts;
  rewardPrompts: RewardPrompt[];
  projects: ProjectInfo[];
}) {
  const [contentVibe, setContentVibe] = useState(site.contentVibe);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showPrompts, setShowPrompts] = useState(false);
  const [promptFilter, setPromptFilter] = useState("all");

  async function saveVibe() {
    setSaving(true);
    setSaved(false);
    await fetch("/api/admin/image-style", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId, contentVibe }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Left column */}
      <div className="space-y-4">
        {/* Corrections */}
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <h3 className="text-sm font-medium mb-1">Content Corrections</h3>
          <p className="text-[10px] text-muted mb-3">
            Tenant-requested adjustments injected into all future generation prompts.
          </p>
          <CorrectionsPanel siteId={siteId} />
        </div>
      </div>

      {/* Right column */}
      <div className="space-y-4">
        {/* Content direction */}
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <h3 className="text-sm font-medium mb-3">Content Direction</h3>
          <label className="block text-[10px] text-muted mb-1">Content Vibe</label>
          <textarea
            value={contentVibe}
            onChange={(e) => {
              setContentVibe(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = e.target.scrollHeight + "px";
            }}
            ref={(el) => { if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; } }}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs focus:border-accent focus:outline-none resize-none overflow-hidden"
            placeholder="Culinary lifestyle — cooking, entertaining, hosting..."
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={saveVibe}
              disabled={saving}
              className="bg-accent px-3 py-1 text-[10px] font-medium text-white rounded hover:bg-accent-hover disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
            {saved && <span className="text-[10px] text-success">Saved</span>}
          </div>
        </div>

        {/* Reward prompts */}
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium">Reward Prompts ({counts.rewardPrompts})</h3>
            <button onClick={() => setShowPrompts(true)} className="text-[10px] text-accent hover:underline">
              View all
            </button>
          </div>
          <div className="flex gap-3 text-xs">
            <div>
              <span className="font-medium">{rewardPrompts.filter(p => p.category === "moment").length}</span>
              <span className="ml-1 text-muted">Moment</span>
            </div>
            <div>
              <span className="font-medium">{rewardPrompts.filter(p => p.category === "lifestyle").length}</span>
              <span className="ml-1 text-muted">Lifestyle</span>
            </div>
            <div>
              <span className="font-medium">{rewardPrompts.filter(p => p.category === "social_proof").length}</span>
              <span className="ml-1 text-muted">Social Proof</span>
            </div>
          </div>
        </div>

        {/* Article generation */}
        <ArticleGeneration
          siteId={siteId}
          rewardPromptCount={counts.rewardPrompts}
          projects={projects}
          projectPromptCount={counts.projectPrompts}
        />
      </div>

      {/* Reward Prompts Modal */}
      {showPrompts && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-8"
          onClick={() => setShowPrompts(false)}
        >
          <div className="w-full max-w-2xl rounded-xl border border-border bg-surface" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h3 className="text-sm font-semibold">Reward Prompt Library ({rewardPrompts.length})</h3>
              <button onClick={() => setShowPrompts(false)} className="text-muted hover:text-foreground">✕</button>
            </div>
            <div className="border-b border-border px-4 py-2">
              <div className="flex gap-1">
                {["all", "moment", "lifestyle", "social_proof"].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setPromptFilter(cat)}
                    className={`rounded px-2 py-1 text-[10px] ${promptFilter === cat ? "bg-accent text-white" : "bg-surface-hover text-muted"}`}
                  >
                    {cat === "all" ? "All" : cat === "social_proof" ? "Social Proof" : cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="max-h-[60vh] overflow-y-auto px-4 py-2">
              {rewardPrompts
                .filter((p) => promptFilter === "all" || p.category === promptFilter)
                .map((p, i) => (
                  <div key={i} className="border-b border-border py-2 last:border-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${
                        p.category === "moment" ? "bg-accent/10 text-accent"
                          : p.category === "lifestyle" ? "bg-success/10 text-success"
                          : "bg-warning/10 text-warning"
                      }`}>
                        {p.category}
                      </span>
                      <span className="rounded bg-surface-hover px-1.5 py-0.5 text-[9px] text-muted">{p.scene}</span>
                    </div>
                    <p className="text-xs">{p.prompt}</p>
                    <p className="mt-0.5 text-[10px] text-muted">{p.visual}</p>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ArticleGeneration({
  siteId,
  rewardPromptCount,
  projects,
  projectPromptCount,
}: {
  siteId: string;
  rewardPromptCount: number;
  projects: ProjectInfo[];
  projectPromptCount: number;
}) {
  const [generatingEditorial, setGeneratingEditorial] = useState(false);
  const [generatingProject, setGeneratingProject] = useState(false);
  const [selectedProject, setSelectedProject] = useState(projects[0]?.id || "");
  const [projectPrompts, setProjectPrompts] = useState<Array<{ title: string; angle: string; assetHint: string }> | null>(null);
  const [loadingProjectPrompts, setLoadingProjectPrompts] = useState(false);

  return (
    <>
      {/* Editorial */}
      <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
        <h3 className="text-sm font-medium mb-1">Editorial Article</h3>
        <p className="text-[10px] text-muted mb-3">
          Generate an authority article from reward prompts ({rewardPromptCount} available).
        </p>
        <button
          onClick={async () => {
            setGeneratingEditorial(true);
            try {
              const res = await fetch(`/api/blog?site_id=${siteId}&action=generate`, { method: "POST" });
              const data = await res.json();
              if (res.ok) toast.success(`Article created: "${data.title || "New article"}" — check the Blog page`);
              else toast.error(data.error || "Generation failed");
            } catch { toast.error("Request failed"); }
            setGeneratingEditorial(false);
          }}
          disabled={generatingEditorial || rewardPromptCount === 0}
          className="bg-accent px-4 py-1.5 text-xs font-medium text-white rounded hover:bg-accent-hover disabled:opacity-50"
        >
          {generatingEditorial ? "Writing..." : "Write Editorial Article"}
        </button>
      </div>

      {/* Project */}
      <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
        <h3 className="text-sm font-medium mb-1">Project Article</h3>
        <p className="text-[10px] text-muted mb-3">
          Generate from a project's captioned assets ({projects.length} projects, {projectPromptCount} prompts).
        </p>
        {projects.length > 0 ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <select
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                className="rounded border border-border bg-background px-2 py-1 text-xs flex-1"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <button
                onClick={async () => {
                  if (!selectedProject) return;
                  setGeneratingProject(true);
                  try {
                    const res = await fetch(`/api/projects/${selectedProject}/generate-article`, { method: "POST" });
                    const data = await res.json();
                    if (res.ok && data.status === "prompts_generated") {
                      const res2 = await fetch(`/api/projects/${selectedProject}/generate-article`, { method: "POST" });
                      const data2 = await res2.json();
                      if (res2.ok && data2.article) toast.success(`Article created: "${data2.article.title}"`);
                      else toast.error(data2.error || "Generation failed");
                    } else if (res.ok && data.article) {
                      toast.success(`Article created: "${data.article.title}"`);
                    } else {
                      toast.error(data.error || "Generation failed");
                    }
                  } catch { toast.error("Request failed"); }
                  setGeneratingProject(false);
                }}
                disabled={generatingProject}
                className="bg-accent px-3 py-1 text-xs font-medium text-white rounded hover:bg-accent-hover disabled:opacity-50"
              >
                {generatingProject ? "Writing..." : "Write"}
              </button>
            </div>
            <button
              onClick={async () => {
                if (!selectedProject) return;
                setLoadingProjectPrompts(true);
                try {
                  const res = await fetch(`/api/projects/${selectedProject}/generate-article`);
                  if (res.ok) {
                    const data = await res.json();
                    setProjectPrompts(data.prompts || []);
                  }
                } catch { /* ignore */ }
                setLoadingProjectPrompts(false);
              }}
              disabled={loadingProjectPrompts}
              className="text-[10px] text-accent hover:underline disabled:opacity-50"
            >
              {loadingProjectPrompts ? "Loading..." : "View prompts"}
            </button>

            {projectPrompts && (
              <div className="rounded-lg border border-border bg-background p-2 mt-2">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[10px] font-medium">{projectPrompts.length} angles</span>
                  <button onClick={() => setProjectPrompts(null)} className="text-[10px] text-muted hover:text-foreground">Close</button>
                </div>
                <div className="max-h-60 overflow-y-auto space-y-2">
                  {projectPrompts.map((p, i) => (
                    <div key={i} className="border-b border-border pb-2 last:border-0">
                      <p className="text-xs font-medium">{p.title}</p>
                      <p className="text-[10px] text-muted">{p.angle}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-[10px] text-muted">No projects configured.</p>
        )}
      </div>
    </>
  );
}
