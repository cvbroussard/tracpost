"use client";

import { useState, useEffect } from "react";
import { ManagePage } from "@/components/manage/manage-page";

interface SiteSettings {
  site: {
    image_style: string | null;
    image_variations: string[] | null;
    image_processing_mode: string | null;
    inline_upload_count: number;
    inline_ai_count: number;
    content_vibe: string | null;
  };
}

function SiteControlsContent({ siteId }: { siteId: string }) {
  const [data, setData] = useState<SiteSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [contentVibe, setContentVibe] = useState("");
  const [imageStyle, setImageStyle] = useState("");
  const [processingMode, setProcessingMode] = useState("auto");
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/manage/site?site_id=${siteId}&view=visual`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        setData(d);
        if (d?.site) {
          setContentVibe(d.site.content_vibe || "");
          setImageStyle(d.site.image_style || "");
          setProcessingMode(d.site.image_processing_mode || "auto");
        }
      })
      .finally(() => setLoading(false));
  }, [siteId]);

  async function saveSection(section: string, payload: Record<string, unknown>) {
    setSaving(section);
    setSaved(null);
    await fetch("/api/admin/image-style", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId, ...payload }),
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
    <div className="p-4 grid grid-cols-2 gap-4">
      {/* Content direction */}
      <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
        <h3 className="text-sm font-medium mb-3">Content Direction</h3>
        <label className="block text-[10px] text-muted mb-1">Content Vibe</label>
        <textarea
          value={contentVibe}
          onChange={e => setContentVibe(e.target.value)}
          ref={el => { if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; } }}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs focus:border-accent focus:outline-none resize-none overflow-hidden"
          placeholder="Culinary lifestyle — cooking, entertaining, hosting..."
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={() => saveSection("vibe", { contentVibe, style: imageStyle, variations: data?.site.image_variations || [], processingMode })}
            disabled={saving === "vibe"}
            className="bg-accent px-3 py-1 text-[10px] font-medium text-white rounded hover:bg-accent-hover disabled:opacity-50"
          >
            Save
          </button>
          {saved === "vibe" && <span className="text-[10px] text-success">Saved</span>}
        </div>
      </div>

      {/* Photography style */}
      <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
        <h3 className="text-sm font-medium mb-3">Photography Style</h3>
        <label className="block text-[10px] text-muted mb-1">How images look</label>
        <textarea
          value={imageStyle}
          onChange={e => setImageStyle(e.target.value)}
          ref={el => { if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; } }}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs focus:border-accent focus:outline-none resize-none overflow-hidden"
          placeholder="Natural daylight, neutral warm palette..."
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={() => saveSection("style", { contentVibe, style: imageStyle, variations: data?.site.image_variations || [], processingMode })}
            disabled={saving === "style"}
            className="bg-accent px-3 py-1 text-[10px] font-medium text-white rounded hover:bg-accent-hover disabled:opacity-50"
          >
            Save
          </button>
          {saved === "style" && <span className="text-[10px] text-success">Saved</span>}
        </div>
      </div>

      {/* Upload processing */}
      <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
        <h3 className="text-sm font-medium mb-3">Upload Processing</h3>
        <div className="flex gap-1">
          {(["auto", "enhance", "off"] as const).map(m => (
            <button
              key={m}
              onClick={() => { setProcessingMode(m); saveSection("processing", { processingMode: m }); }}
              className={`rounded px-3 py-1.5 text-xs ${
                processingMode === m ? "bg-accent text-white" : "bg-surface-hover text-muted hover:text-foreground"
              }`}
            >
              {m === "auto" ? "Auto" : m === "enhance" ? "Enhance Only" : "Off"}
            </button>
          ))}
        </div>
      </div>

      {/* Image mix */}
      <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
        <h3 className="text-sm font-medium mb-3">Image Mix Per Article</h3>
        <div className="flex items-center gap-4">
          <div>
            <label className="block text-[10px] text-muted mb-1">Uploads</label>
            <select
              value={data?.site.inline_upload_count ?? 1}
              onChange={e => saveSection("mix", { inlineUploadCount: Number(e.target.value), inlineAiCount: data?.site.inline_ai_count ?? 3 })}
              className="rounded border border-border bg-background px-2 py-1 text-xs"
            >
              {[0, 1, 2, 3].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-muted mb-1">AI Editorial</label>
            <select
              value={data?.site.inline_ai_count ?? 3}
              onChange={e => saveSection("mix", { inlineUploadCount: data?.site.inline_upload_count ?? 1, inlineAiCount: Number(e.target.value) })}
              className="rounded border border-border bg-background px-2 py-1 text-xs"
            >
              {[0, 1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ManageSitesPage() {
  return (
    <ManagePage title="Site Controls" requireSite>
      {({ siteId }) => <SiteControlsContent siteId={siteId} />}
    </ManagePage>
  );
}
