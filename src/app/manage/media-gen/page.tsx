"use client";

import { useState, useEffect } from "react";
import { ManagePage } from "@/components/manage/manage-page";
import { HeroOverridePicker, RenderPipelineButton } from "@/app/admin/sites/[siteId]/website-pane";

interface MediaGenData {
  site: {
    image_style: string | null;
    image_variations: string[] | null;
    image_processing_mode: string | null;
    inline_upload_count: number;
    inline_ai_count: number;
    content_vibe: string | null;
    hero_asset_id: string | null;
  };
  heroAssets: Array<{ id: string; storage_url: string; context_note: string | null; quality_score: number | null }>;
}

function MediaGenContent({ siteId }: { siteId: string }) {
  const [data, setData] = useState<MediaGenData | null>(null);
  const [loading, setLoading] = useState(true);
  const [imageStyle, setImageStyle] = useState("");
  const [processingMode, setProcessingMode] = useState("auto");
  const [variations, setVariations] = useState<string[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setData(null);
    fetch(`/api/manage/site?site_id=${siteId}&view=visual`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        setData(d);
        if (d?.site) {
          setImageStyle(d.site.image_style || "");
          setProcessingMode(d.site.image_processing_mode || "auto");
          setVariations(d.site.image_variations || []);
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

  if (!data) return <p className="p-6 text-xs text-muted">Failed to load.</p>;

  const assetCount = data.heroAssets?.length || 0;

  return (
    <div className="p-4">
      <div className="grid grid-cols-2 gap-4">
      {/* Left column */}
      <div className="space-y-4">
      {/* Photography style */}
      <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
        <h3 className="text-sm font-medium mb-3">Photography Style</h3>
        <textarea
          value={imageStyle}
          onChange={e => setImageStyle(e.target.value)}
          ref={el => { if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; } }}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs focus:border-accent focus:outline-none resize-none overflow-hidden"
          placeholder="Natural daylight, neutral warm palette..."
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={() => saveSection("style", { style: imageStyle, contentVibe: data.site.content_vibe, variations: data.site.image_variations || [], processingMode })}
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
        <div className="flex gap-1 mb-4">
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

        <h3 className="text-sm font-medium mb-3 mt-4">Image Mix Per Article</h3>
        <div className="flex items-center gap-4">
          <div>
            <label className="block text-[10px] text-muted mb-1">Uploads</label>
            <select
              value={data.site.inline_upload_count ?? 1}
              onChange={e => saveSection("mix", { inlineUploadCount: Number(e.target.value), inlineAiCount: data.site.inline_ai_count ?? 3 })}
              className="rounded border border-border bg-background px-2 py-1 text-xs"
            >
              {[0, 1, 2, 3].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-muted mb-1">AI Editorial</label>
            <select
              value={data.site.inline_ai_count ?? 3}
              onChange={e => saveSection("mix", { inlineUploadCount: data.site.inline_upload_count ?? 1, inlineAiCount: Number(e.target.value) })}
              className="rounded border border-border bg-background px-2 py-1 text-xs"
            >
              {[0, 1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Composition variations */}
      <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
        <h3 className="text-sm font-medium mb-3">Composition Variations ({variations.length})</h3>
        <div className="space-y-1.5 mb-2">
          {variations.map((v, i) => (
            <div key={i} className="flex gap-1.5">
              <span className="mt-1.5 text-[10px] text-muted">{i + 1}.</span>
              <input
                value={v}
                onChange={e => {
                  const updated = [...variations];
                  updated[i] = e.target.value;
                  setVariations(updated);
                }}
                className="flex-1 rounded border border-border bg-background px-2 py-1 text-[10px] focus:border-accent focus:outline-none"
              />
              <button
                onClick={() => setVariations(variations.filter((_, idx) => idx !== i))}
                className="text-[10px] text-muted hover:text-danger px-1"
              >
                ✕
              </button>
            </div>
          ))}
          {variations.length < 8 && (
            <button onClick={() => setVariations([...variations, ""])} className="text-[10px] text-accent hover:underline">
              + Add
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => saveSection("variations", { style: imageStyle, contentVibe: data.site.content_vibe, variations, processingMode })}
            disabled={saving === "variations"}
            className="bg-accent px-3 py-1 text-[10px] font-medium text-white rounded hover:bg-accent-hover disabled:opacity-50"
          >
            Save
          </button>
          {saved === "variations" && <span className="text-[10px] text-success">Saved</span>}
        </div>
      </div>

      </div>

      {/* Right column */}
      <div className="space-y-4">
      {/* Quality gates — read only */}
      <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
        <h3 className="text-sm font-medium mb-3">Quality Gates</h3>
        <div className="space-y-1.5 text-xs">
          <div className="flex items-baseline justify-between py-1 border-b border-border">
            <span className="text-[10px] text-muted">Content Guard</span>
            <span className="font-medium text-success">Active</span>
          </div>
          <div className="flex items-baseline justify-between py-1 border-b border-border">
            <span className="text-[10px] text-muted">Quality Cutoff</span>
            <span className="font-medium">0.7</span>
          </div>
          <div className="flex items-baseline justify-between py-1 border-b border-border">
            <span className="text-[10px] text-muted">URL Validation</span>
            <span className="font-medium text-success">Active</span>
          </div>
          <div className="flex items-baseline justify-between py-1">
            <span className="text-[10px] text-muted">Asset Pool</span>
            <span className="font-medium">{assetCount} triaged</span>
          </div>
        </div>
      </div>

      {/* Hero image */}
      <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
        <h3 className="text-sm font-medium mb-1">Hero Image</h3>
        <p className="text-[10px] text-muted mb-3">Pin a specific hero or let quality score decide.</p>
        <HeroOverridePicker
          siteId={siteId}
          initialHeroAssetId={data.site.hero_asset_id || null}
          candidates={data.heroAssets}
        />
      </div>

      {/* Render pipeline */}
      <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
        <h3 className="text-sm font-medium mb-1">Render Pipeline</h3>
        <p className="text-[10px] text-muted mb-3">Batch render pending assets across all platforms.</p>
        <RenderPipelineButton siteId={siteId} />
      </div>

      </div>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <ManagePage title="Media Generation" requireSite>
      {({ siteId }) => <MediaGenContent siteId={siteId} />}
    </ManagePage>
  );
}
