"use client";

import { useState } from "react";
import { HeroOverridePicker, RenderPipelineButton } from "../website-pane";
import type { SiteData, HeroAsset } from "../site-tabs";

export function VisualTab({
  siteId,
  site,
  heroAssetCandidates,
  currentHeroAssetId,
}: {
  siteId: string;
  site: SiteData;
  heroAssetCandidates: HeroAsset[];
  currentHeroAssetId: string | null;
}) {
  const [imageStyle, setImageStyle] = useState(site.imageStyle);
  const [variations, setVariations] = useState(site.imageVariations);
  const [processingMode, setProcessingMode] = useState(site.imageProcessingMode);
  const [inlineUploadCount, setInlineUploadCount] = useState(site.inlineUploadCount ?? 1);
  const [inlineAiCount, setInlineAiCount] = useState(site.inlineAiCount ?? 3);
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
        {/* Photography style */}
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <h3 className="text-sm font-medium mb-3">Photography Style</h3>
          <label className="block text-[10px] text-muted mb-1">How images look</label>
          <textarea
            value={imageStyle}
            onChange={(e) => {
              setImageStyle(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = e.target.scrollHeight + "px";
            }}
            ref={(el) => { if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; } }}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs focus:border-accent focus:outline-none resize-none overflow-hidden"
            placeholder="Natural daylight, neutral warm palette, medium format..."
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={() => saveSection("style", { style: imageStyle, contentVibe: site.contentVibe, variations, processingMode })}
              className="bg-accent px-3 py-1 text-[10px] font-medium text-white rounded hover:bg-accent-hover"
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
            {(["auto", "enhance", "off"] as const).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setProcessingMode(m);
                  saveSection("processing", { processingMode: m });
                }}
                className={`rounded px-3 py-1.5 text-xs ${
                  processingMode === m ? "bg-accent text-white" : "bg-surface-hover text-muted hover:text-foreground"
                }`}
              >
                {m === "auto" ? "Auto" : m === "enhance" ? "Enhance Only" : "Off"}
              </button>
            ))}
          </div>
        </div>

        {/* Composition variations */}
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <h3 className="text-sm font-medium mb-3">Composition Variations ({variations.length})</h3>
          <div className="space-y-1.5">
            {variations.map((v, i) => (
              <div key={i} className="flex gap-1.5">
                <span className="mt-1.5 text-[10px] text-muted">{i + 1}.</span>
                <input
                  value={v}
                  onChange={(e) => {
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
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={() => saveSection("variations", { style: imageStyle, contentVibe: site.contentVibe, variations, processingMode })}
              className="bg-accent px-3 py-1 text-[10px] font-medium text-white rounded hover:bg-accent-hover"
            >
              Save
            </button>
            {saved === "variations" && <span className="text-[10px] text-success">Saved</span>}
          </div>
        </div>
      </div>

      {/* Right column */}
      <div className="space-y-4">
        {/* Hero image */}
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <h3 className="text-sm font-medium mb-1">Hero Image</h3>
          <p className="text-[10px] text-muted mb-3">
            Home page hero defaults to highest quality score. Pin a specific one to override.
          </p>
          <HeroOverridePicker
            siteId={siteId}
            initialHeroAssetId={currentHeroAssetId}
            candidates={heroAssetCandidates}
          />
        </div>

        {/* Render pipeline */}
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <h3 className="text-sm font-medium mb-1">Render Pipeline</h3>
          <p className="text-[10px] text-muted mb-3">
            Per-platform image rendering: smart crop, color grade, text overlays, watermark.
          </p>
          <RenderPipelineButton siteId={siteId} />
        </div>

        {/* Image mix */}
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <h3 className="text-sm font-medium mb-3">Image Mix Per Article</h3>
          <div className="flex items-center gap-4">
            <div>
              <label className="block text-[10px] text-muted mb-1">Uploads</label>
              <select
                value={inlineUploadCount}
                onChange={(e) => setInlineUploadCount(Number(e.target.value))}
                className="rounded border border-border bg-background px-2 py-1 text-xs"
              >
                {[0, 1, 2, 3].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-muted mb-1">AI Editorial</label>
              <select
                value={inlineAiCount}
                onChange={(e) => setInlineAiCount(Number(e.target.value))}
                className="rounded border border-border bg-background px-2 py-1 text-xs"
              >
                {[0, 1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div className="text-[10px] text-muted mt-4">
              = {1 + inlineUploadCount + inlineAiCount} total
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={() => saveSection("mix", { inlineUploadCount, inlineAiCount })}
              className="bg-accent px-3 py-1 text-[10px] font-medium text-white rounded hover:bg-accent-hover"
            >
              Save
            </button>
            {saved === "mix" && <span className="text-[10px] text-success">Saved</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
