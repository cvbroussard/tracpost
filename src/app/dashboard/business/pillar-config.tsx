"use client";

import { useState } from "react";
import { MAX_TAGS_PER_PILLAR, COACHING_MIN_TAGS_PER_PILLAR } from "@/lib/pillars/validate";

interface PillarTag {
  id: string;
  label: string;
}

interface Pillar {
  id: string;
  framework?: string;
  label: string;
  description: string;
  tags: PillarTag[];
}

const FRAMEWORK = [
  { id: "what", framework: "What We Do" },
  { id: "how", framework: "How We Do It" },
  { id: "who", framework: "Who We Work With" },
  { id: "proof", framework: "Proof It Works" },
  { id: "why", framework: "Why It Matters" },
];

export function PillarConfigEditor({
  siteId,
  initialConfig,
}: {
  siteId: string;
  initialConfig: Pillar[];
}) {
  const normalized = FRAMEWORK.map((f) => {
    const existing = initialConfig.find((p) => p.id === f.id);
    return existing || { ...f, label: "", description: "", tags: [] };
  });

  const [config, setConfig] = useState<Pillar[]>(normalized);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const hasConfig = config.some((p) => p.label && p.tags.length > 0);

  async function save() {
    setSaving(true);
    setSaved(false);
    await fetch("/api/dashboard/pillar-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId, config }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function updateTag(pillarId: string, tagIndex: number, label: string) {
    const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 20);
    setConfig((prev) =>
      prev.map((p) =>
        p.id === pillarId
          ? { ...p, tags: p.tags.map((t, i) => (i === tagIndex ? { id: id || t.id, label } : t)) }
          : p
      )
    );
  }

  function addTag(pillarId: string) {
    setConfig((prev) =>
      prev.map((p) => {
        if (p.id !== pillarId) return p;
        // Defensive cap (UI button is also disabled at MAX_TAGS_PER_PILLAR)
        if (p.tags.length >= MAX_TAGS_PER_PILLAR) return p;
        return { ...p, tags: [...p.tags, { id: `new_${p.tags.length}`, label: "" }] };
      })
    );
  }

  function removeTag(pillarId: string, tagIndex: number) {
    setConfig((prev) =>
      prev.map((p) =>
        p.id === pillarId
          ? { ...p, tags: p.tags.filter((_, i) => i !== tagIndex) }
          : p
      )
    );
  }

  if (!hasConfig) {
    return (
      <section className="mb-8">
        <h2 className="mb-1">Content Pillars</h2>
        <p className="text-sm text-muted">
          Your content pillars will be configured after your playbook is sharpened.
        </p>
      </section>
    );
  }

  return (
    <section className="mb-8">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2>Content Pillars</h2>
          <p className="mt-1 text-xs text-muted">
            Five pillars organize your content. Tags guide AI content generation.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {saving && <span className="text-[10px] text-muted">Saving...</span>}
          {saved && <span className="text-[10px] text-success">Saved</span>}
          <button
            onClick={save}
            className="bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-accent-hover"
          >
            Save
          </button>
        </div>
      </div>

      {config.map((pillar) => {
        const isOpen = expanded === pillar.id;
        const isConfigured = pillar.label && pillar.tags.length > 0;

        return (
          <div key={pillar.id} className="border-b border-border last:border-0">
            <button
              onClick={() => setExpanded(isOpen ? null : pillar.id)}
              className="flex w-full items-center justify-between py-3 text-left"
            >
              <div className="flex items-center gap-2">
                <span className="rounded bg-surface-hover px-1.5 py-0.5 text-[10px] text-muted">
                  {pillar.framework}
                </span>
                <span className={`text-sm font-medium ${isConfigured ? "" : "text-muted italic"}`}>
                  {pillar.label || "Not configured"}
                </span>
                {isConfigured && (
                  <span
                    className={`text-xs ${
                      pillar.tags.length > MAX_TAGS_PER_PILLAR
                        ? "text-danger font-medium"
                        : pillar.tags.length < COACHING_MIN_TAGS_PER_PILLAR
                        ? "text-warning"
                        : "text-muted"
                    }`}
                    title={
                      pillar.tags.length > MAX_TAGS_PER_PILLAR
                        ? `Over the ${MAX_TAGS_PER_PILLAR}-tag cap — trim before saving`
                        : pillar.tags.length < COACHING_MIN_TAGS_PER_PILLAR
                        ? `Pillars with fewer than ${COACHING_MIN_TAGS_PER_PILLAR} tags rarely sustain content variety`
                        : undefined
                    }
                  >
                    {pillar.tags.length} / {MAX_TAGS_PER_PILLAR} tags
                  </span>
                )}
              </div>
              <span className="text-xs text-muted">{isOpen ? "▾" : "▸"}</span>
            </button>

            {isOpen && (
              <div className="pb-4">
                <p className="mb-3 text-xs text-dim">
                  {pillar.id === "what" ? "The craft, skill, or service itself" :
                   pillar.id === "how" ? "The process, tools, infrastructure, standards" :
                   pillar.id === "who" ? "Vendors, materials, partners, artisans" :
                   pillar.id === "proof" ? "Projects, results, case studies, before/after" :
                   "Philosophy, perspective, culture, community"}
                </p>

                <div className="mb-3">
                  <label className="mb-1 block text-xs text-muted">
                    Tags ({pillar.tags.length} / {MAX_TAGS_PER_PILLAR})
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {pillar.tags.map((tag, i) => (
                      <div key={tag.id || i} className="flex items-center gap-1 rounded bg-surface-hover px-2 py-1">
                        <input
                          value={tag.label}
                          onChange={(e) => updateTag(pillar.id, i, e.target.value)}
                          className="w-28 bg-transparent text-xs outline-none"
                          placeholder="Tag name"
                        />
                        <button
                          onClick={() => removeTag(pillar.id, i)}
                          className="text-xs text-muted hover:text-danger"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => addTag(pillar.id)}
                      disabled={pillar.tags.length >= MAX_TAGS_PER_PILLAR}
                      className={`rounded bg-surface-hover px-2 py-1 text-xs ${
                        pillar.tags.length >= MAX_TAGS_PER_PILLAR
                          ? "cursor-not-allowed text-muted/40"
                          : "text-muted hover:text-foreground"
                      }`}
                      title={
                        pillar.tags.length >= MAX_TAGS_PER_PILLAR
                          ? `Reached the ${MAX_TAGS_PER_PILLAR}-tag cap — remove one to add another`
                          : "Add a tag"
                      }
                    >
                      + Tag
                    </button>
                  </div>
                  {pillar.tags.length > MAX_TAGS_PER_PILLAR && (
                    <p className="mt-2 text-[11px] text-danger">
                      ⚠ Over the {MAX_TAGS_PER_PILLAR}-tag cap. Remove {pillar.tags.length - MAX_TAGS_PER_PILLAR} to save.
                    </p>
                  )}
                  {pillar.tags.length > 0 && pillar.tags.length < COACHING_MIN_TAGS_PER_PILLAR && (
                    <p className="mt-2 text-[11px] text-warning">
                      Pillars with fewer than {COACHING_MIN_TAGS_PER_PILLAR} tags rarely sustain content variety. Consider adding more.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
