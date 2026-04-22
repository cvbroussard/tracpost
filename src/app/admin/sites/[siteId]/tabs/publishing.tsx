"use client";

import { useState } from "react";
import { AutopilotControls } from "../website-pane";
import type { SiteData, Platform } from "../site-tabs";

export function PublishingTab({
  siteId,
  site,
  platforms,
}: {
  siteId: string;
  site: SiteData;
  platforms: Platform[];
}) {
  const [autopilotEnabled, setAutopilotEnabled] = useState(site.autopilotEnabled);
  const [blogSlug, setBlogSlug] = useState(site.subdomain || "");
  const [videoRatio, setVideoRatio] = useState(site.videoRatio || "1:3");
  const [blogCadence, setBlogCadence] = useState(site.blogCadence || 0);
  const [articleRatio, setArticleRatio] = useState(site.articleMix || "3:1");
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  async function saveSection(section: string, data: Record<string, unknown>) {
    setSaving(section);
    setSaved(null);
    await fetch("/api/admin/image-style", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId, ...data }),
    });
    setSaving(null);
    setSaved(section);
    setTimeout(() => setSaved(null), 2000);
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Left column */}
      <div className="space-y-4">
        {/* Autopilot */}
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <h3 className="text-sm font-medium mb-3">Autopilot</h3>
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={() => {
                const next = !autopilotEnabled;
                setAutopilotEnabled(next);
                saveSection("autopilot", { autopilotEnabled: next });
              }}
              className={`rounded px-4 py-1.5 text-xs font-medium ${
                autopilotEnabled ? "bg-success text-white" : "bg-surface-hover text-muted"
              }`}
            >
              {autopilotEnabled ? "Active" : "Off"}
            </button>
            {saving === "autopilot" && <span className="text-[10px] text-muted">Saving...</span>}
            {saved === "autopilot" && <span className="text-[10px] text-success">Saved</span>}
          </div>

          <AutopilotControls siteId={siteId} />
        </div>

        {/* Blog settings */}
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <h3 className="text-sm font-medium mb-3">Blog Settings</h3>

          <div className="space-y-3">
            <div>
              <label className="block text-[10px] text-muted mb-1">Blog Slug</label>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted">staging.tracpost.com/</span>
                <input
                  type="text"
                  value={blogSlug}
                  onChange={(e) => setBlogSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  className="rounded border border-border bg-background px-2 py-1 text-xs w-28"
                  placeholder="siteslug"
                />
                <span className="text-[10px] text-muted">/blog</span>
                <button
                  onClick={() => saveSection("blogSlug", { blogSlug })}
                  className="bg-accent px-2 py-1 text-[10px] font-medium text-white rounded hover:bg-accent-hover"
                >
                  Save
                </button>
                {blogSlug && (
                  <a
                    href={`https://staging.tracpost.com/${blogSlug}/blog`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-accent hover:underline"
                  >
                    Open
                  </a>
                )}
              </div>
            </div>

            <div>
              <label className="block text-[10px] text-muted mb-1">Blog Cadence</label>
              <div className="flex items-center gap-2">
                <select
                  value={blogCadence}
                  onChange={(e) => setBlogCadence(Number(e.target.value))}
                  className="rounded border border-border bg-background px-2 py-1 text-xs"
                >
                  <option value={0}>Off</option>
                  <option value={1}>1/week</option>
                  <option value={2}>2/week</option>
                  <option value={3}>3/week</option>
                  <option value={5}>5/week</option>
                  <option value={7}>7/week</option>
                </select>
                <button
                  onClick={() => saveSection("blogCadence", { blogCadence })}
                  className="bg-accent px-2 py-1 text-[10px] font-medium text-white rounded hover:bg-accent-hover"
                >
                  Save
                </button>
                {saved === "blogCadence" && <span className="text-[10px] text-success">Saved</span>}
              </div>
            </div>

            <div>
              <label className="block text-[10px] text-muted mb-1">Article Mix</label>
              <div className="flex items-center gap-2">
                <select
                  value={articleRatio}
                  onChange={(e) => setArticleRatio(e.target.value)}
                  className="rounded border border-border bg-background px-2 py-1 text-xs"
                >
                  <option value="1:0">Editorial only</option>
                  <option value="3:1">3 editorial : 1 project</option>
                  <option value="2:1">2 editorial : 1 project</option>
                  <option value="1:1">Balanced</option>
                  <option value="1:2">1 editorial : 2 project</option>
                  <option value="0:1">Project only</option>
                </select>
                <button
                  onClick={() => saveSection("articleRatio", { articleRatio })}
                  className="bg-accent px-2 py-1 text-[10px] font-medium text-white rounded hover:bg-accent-hover"
                >
                  Save
                </button>
                {saved === "articleRatio" && <span className="text-[10px] text-success">Saved</span>}
              </div>
            </div>

            <div>
              <label className="block text-[10px] text-muted mb-1">Video Ratio</label>
              <div className="flex items-center gap-2">
                <select
                  value={videoRatio}
                  onChange={(e) => setVideoRatio(e.target.value)}
                  className="rounded border border-border bg-background px-2 py-1 text-xs"
                >
                  <option value="1:1">Every post</option>
                  <option value="1:2">1 in 2</option>
                  <option value="1:3">1 in 3</option>
                  <option value="1:4">1 in 4</option>
                  <option value="1:5">1 in 5</option>
                  <option value="0:1">No video</option>
                </select>
                <button
                  onClick={() => saveSection("video", { videoRatio })}
                  className="bg-accent px-2 py-1 text-[10px] font-medium text-white rounded hover:bg-accent-hover"
                >
                  Save
                </button>
                {saved === "video" && <span className="text-[10px] text-success">Saved</span>}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right column */}
      <div className="space-y-4">
        {/* Connected platforms */}
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <h3 className="text-sm font-medium mb-3">Connected Platforms ({platforms.length})</h3>
          {platforms.length > 0 ? (
            <div className="space-y-1.5">
              {platforms.map((p) => (
                <div key={p.platform} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                  <span className="text-xs capitalize">{p.platform}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted">{p.account_name}</span>
                    <span className={`h-1.5 w-1.5 rounded-full ${p.status === "active" ? "bg-success" : "bg-muted"}`} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-muted">No platforms connected.</p>
          )}

          {Object.keys(site.cadenceConfig).length > 0 && (
            <div className="mt-3 pt-3 border-t border-border">
              <p className="mb-1 text-[10px] text-muted">Cadence per platform</p>
              {Object.entries(site.cadenceConfig).map(([platform, count]) => (
                <div key={platform} className="flex items-baseline justify-between py-1">
                  <span className="text-[10px] text-muted capitalize">{platform}</span>
                  <span className="text-xs">{typeof count === "number" ? count : JSON.stringify(count)}/week</span>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
