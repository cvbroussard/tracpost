"use client";

import { useState, useEffect } from "react";
import { ManagePage } from "@/components/manage/manage-page";

function BlogConfigContent({ siteId }: { siteId: string }) {
  const [loading, setLoading] = useState(true);
  const [blogSlug, setBlogSlug] = useState("");
  const [blogCadence, setBlogCadence] = useState(0);
  const [articleRatio, setArticleRatio] = useState("3:1");
  const [videoRatio, setVideoRatio] = useState("1:3");
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/ops/site?site_id=${siteId}&view=publishing`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.site) {
          setBlogSlug(d.site.subdomain || "");
          setBlogCadence(d.site.blog_cadence || 0);
          setArticleRatio(d.site.article_mix || "3:1");
          setVideoRatio(d.site.video_ratio || "1:3");
        }
      })
      .finally(() => setLoading(false));
  }, [siteId]);

  async function saveField(section: string, data: Record<string, unknown>) {
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

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card space-y-4">
          <h3 className="text-sm font-medium">Blog Settings</h3>

          <div>
            <label className="block text-[10px] text-muted mb-1">Blog Slug</label>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted">tracpost.com/</span>
              <input
                type="text"
                value={blogSlug}
                onChange={e => setBlogSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                className="rounded border border-border bg-background px-2 py-1 text-xs w-28"
                placeholder="siteslug"
              />
              <span className="text-[10px] text-muted">/blog</span>
              <button
                onClick={() => saveField("blogSlug", { blogSlug })}
                disabled={saving === "blogSlug"}
                className="bg-accent px-2 py-1 text-[10px] font-medium text-white rounded hover:bg-accent-hover disabled:opacity-50"
              >
                Save
              </button>
              {saved === "blogSlug" && <span className="text-[10px] text-success">Saved</span>}
              {blogSlug && (
                <a href={`https://tracpost.com/${blogSlug}/blog`} target="_blank" rel="noopener noreferrer" className="text-[10px] text-accent hover:underline">
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
                onChange={e => { setBlogCadence(Number(e.target.value)); saveField("blogCadence", { blogCadence: Number(e.target.value) }); }}
                className="rounded border border-border bg-background px-2 py-1 text-xs"
              >
                <option value={0}>Off</option>
                <option value={1}>1/week</option>
                <option value={2}>2/week</option>
                <option value={3}>3/week</option>
                <option value={5}>5/week</option>
                <option value={7}>7/week</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[10px] text-muted mb-1">Article Mix</label>
            <div className="flex items-center gap-2">
              <select
                value={articleRatio}
                onChange={e => { setArticleRatio(e.target.value); saveField("articleRatio", { articleRatio: e.target.value }); }}
                className="rounded border border-border bg-background px-2 py-1 text-xs"
              >
                <option value="1:0">Editorial only</option>
                <option value="3:1">3 editorial : 1 project</option>
                <option value="2:1">2 editorial : 1 project</option>
                <option value="1:1">Balanced</option>
                <option value="1:2">1 editorial : 2 project</option>
                <option value="0:1">Project only</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[10px] text-muted mb-1">Video Ratio</label>
            <div className="flex items-center gap-2">
              <select
                value={videoRatio}
                onChange={e => { setVideoRatio(e.target.value); saveField("video", { videoRatio: e.target.value }); }}
                className="rounded border border-border bg-background px-2 py-1 text-xs"
              >
                <option value="1:1">Every post</option>
                <option value="1:2">1 in 2</option>
                <option value="1:3">1 in 3</option>
                <option value="1:4">1 in 4</option>
                <option value="1:5">1 in 5</option>
                <option value="0:1">No video</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <ManagePage title="Blog Settings" requireSite>
      {({ siteId }) => <BlogConfigContent siteId={siteId} />}
    </ManagePage>
  );
}
