"use client";

import { useState } from "react";

export function ImageStyleEditor({
  siteId,
  initialStyle,
  initialVariations,
  initialProcessingMode,
  initialContentVibe,
}: {
  siteId: string;
  initialStyle: string;
  initialVariations: string[];
  initialProcessingMode: string;
  initialContentVibe: string;
}) {
  const [style, setStyle] = useState(initialStyle);
  const [variations, setVariations] = useState(initialVariations);
  const [processingMode, setProcessingMode] = useState(initialProcessingMode || "auto");
  const [contentVibe, setContentVibe] = useState(initialContentVibe);
  const [isOpen, setIsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    setSaved(false);
    await fetch("/api/admin/image-style", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId, style, variations, processingMode, contentVibe }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function updateVariation(index: number, value: string) {
    setVariations((prev) => prev.map((v, i) => (i === index ? value : v)));
  }

  function addVariation() {
    if (variations.length < 8) {
      setVariations((prev) => [...prev, ""]);
    }
  }

  function removeVariation(index: number) {
    setVariations((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <div className="mt-3">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-xs font-medium text-accent hover:underline"
      >
        {isOpen ? "▾" : "▸"} Image Style {style ? "(configured)" : "(not set)"}
      </button>

      {isOpen && (
        <div className="mt-2 rounded border border-border bg-background p-3">
          <div className="mb-3">
            <label className="mb-1 block text-[10px] text-muted">Upload Processing</label>
            <div className="flex gap-1 text-[10px]">
              {(["auto", "enhance", "off"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setProcessingMode(m)}
                  className={`rounded px-2.5 py-1 ${
                    processingMode === m ? "bg-accent text-white" : "bg-surface-hover text-muted"
                  }`}
                >
                  {m === "auto" ? "Auto" : m === "enhance" ? "Enhance Only" : "Off"}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[9px] text-muted">
              {processingMode === "auto" && "Quality gate — good photos get enhanced, poor photos get regenerated as AI hero images."}
              {processingMode === "enhance" && "Always enhance, never regenerate. Preserves authenticity — for brands where real photos matter."}
              {processingMode === "off" && "No image processing. Raw uploads published as-is."}
            </p>
          </div>

          <div className="mb-3">
          <div className="mb-3">
            <label className="mb-1 block text-[10px] text-muted">Content Vibe</label>
            <textarea
              value={contentVibe}
              onChange={(e) => setContentVibe(e.target.value)}
              className="w-full text-xs"
              rows={2}
              placeholder="Culinary lifestyle — cooking, entertaining, hosting. Show kitchens in use, not under construction."
            />
            <p className="mt-0.5 text-[9px] text-muted">
              Controls what images and articles are ABOUT. Photography Style controls how they LOOK.
            </p>
          </div>

            <label className="mb-1 block text-[10px] text-muted">Base Photography Style</label>
            <textarea
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              className="w-full text-xs"
              rows={3}
              placeholder="Professional product photography for a luxury furniture brand. Natural daylight, neutral warm palette, minimal staging. Shot on medium format camera. Shallow depth of field. Clean, editorial style. No text, no watermarks, no people."
            />
          </div>

          <div className="mb-3">
            <label className="mb-1 block text-[10px] text-muted">
              Composition Variations ({variations.length}/8)
            </label>
            <div className="space-y-1">
              {variations.map((v, i) => (
                <div key={i} className="flex gap-1">
                  <span className="mt-1 text-[10px] text-muted">{i + 1}.</span>
                  <input
                    value={v}
                    onChange={(e) => updateVariation(i, e.target.value)}
                    className="flex-1 text-[10px]"
                    placeholder="e.g., Wide environmental shot — full room context"
                  />
                  <button
                    onClick={() => removeVariation(i)}
                    className="text-[10px] text-muted hover:text-danger"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {variations.length < 8 && (
                <button
                  onClick={addVariation}
                  className="text-[10px] text-muted hover:text-foreground"
                >
                  + Add variation
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {saving && <span className="text-[10px] text-muted">Saving...</span>}
            {saved && <span className="text-[10px] text-success">Saved</span>}
            <button
              onClick={save}
              className="bg-accent px-2 py-0.5 text-[10px] font-medium text-white hover:bg-accent-hover"
            >
              Save Style
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
