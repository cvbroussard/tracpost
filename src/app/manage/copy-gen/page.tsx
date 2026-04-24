"use client";

import { useState, useEffect } from "react";
import { ManagePage } from "@/components/manage/manage-page";
import { CorrectionsPanel } from "@/app/admin/sites/[siteId]/website-pane";
import { ContextReview } from "@/app/admin/provisioning/context-review";

interface Pillar {
  id: string;
  framework: string;
  label: string;
  description: string;
  tags: Array<{ id: string; label: string }>;
}

function CopyGenContent({ siteId }: { siteId: string }) {
  const [contentVibe, setContentVibe] = useState("");
  const [pillars, setPillars] = useState<Pillar[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [expandedPillar, setExpandedPillar] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/manage/site?site_id=${siteId}&view=visual`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.site) {
          setContentVibe(d.site.content_vibe || "");
          setPillars((d.site.pillar_config || []) as Pillar[]);
        }
      })
      .finally(() => setLoading(false));
  }, [siteId]);

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

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  const configuredCount = pillars.filter(p => p.tags.length > 0).length;

  return (
    <div className="p-4">
      <div className="grid grid-cols-2 gap-4">
        {/* Left column */}
        <div className="space-y-4">
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
              onClick={saveVibe}
              disabled={saving}
              className="bg-accent px-3 py-1 text-[10px] font-medium text-white rounded hover:bg-accent-hover disabled:opacity-50"
            >
              Save
            </button>
            {saved && <span className="text-[10px] text-success">Saved</span>}
          </div>
        </div>

        {/* Context notes */}
        <ContextNotesCard siteId={siteId} />
        </div>

        {/* Right column */}
        <div className="space-y-4">
        {/* Content corrections */}
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <h3 className="text-sm font-medium mb-1">Content Corrections</h3>
          <p className="text-[10px] text-muted mb-3">Tenant-requested adjustments injected into all future generation prompts.</p>
          <CorrectionsPanel siteId={siteId} />
        </div>

        {/* Content pillars */}
        <PillarsEditor siteId={siteId} initial={pillars} />
        </div>
      </div>
    </div>
  );
}

function ContextNotesCard({ siteId }: { siteId: string }) {
  const [assets, setAssets] = useState<Array<{
    id: string; storage_url: string; context_note: string | null;
    quality_score: number | null; context_auto_generated: boolean; detected_vendors: string[];
  }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/manage/context-notes?site_id=${siteId}`)
      .then(r => r.ok ? r.json() : { assets: [] })
      .then(d => setAssets(d.assets || []))
      .finally(() => setLoading(false));
  }, [siteId]);

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
        <h3 className="text-sm font-medium mb-2">Context Notes</h3>
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
      <ContextReview siteId={siteId} initialAssets={assets} />
    </div>
  );
}

function PillarsEditor({ siteId, initial }: { siteId: string; initial: Pillar[] }) {
  const [pillars, setPillarsState] = useState<Pillar[]>(initial);
  const [expandedPillar, setExpandedPillar] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setPillarsState(initial); }, [initial]);

  function updatePillar(id: string, patch: Partial<Pillar>) {
    setPillarsState(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p));
  }

  function addTag(pillarId: string) {
    const label = (tagInput[pillarId] || "").trim();
    if (!label) return;
    const tagId = label.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    updatePillar(pillarId, {
      tags: [...(pillars.find(p => p.id === pillarId)?.tags || []), { id: tagId, label }],
    });
    setTagInput(prev => ({ ...prev, [pillarId]: "" }));
  }

  function removeTag(pillarId: string, tagId: string) {
    const pillar = pillars.find(p => p.id === pillarId);
    if (!pillar) return;
    updatePillar(pillarId, { tags: pillar.tags.filter(t => t.id !== tagId) });
  }

  async function save() {
    setSaving(true);
    setSaved(false);
    await fetch("/api/admin/pillar-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId, pillars }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const configuredCount = pillars.filter(p => p.tags.length > 0).length;

  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-accent">Content Pillars ({configuredCount}/{pillars.length} configured)</h3>
      </div>

      {pillars.length > 0 ? (
        <div className="space-y-1">
          {pillars.map(pillar => {
            const isExpanded = expandedPillar === pillar.id;
            return (
              <div key={pillar.id} className="border border-border rounded-lg overflow-hidden">
                <button
                  onClick={() => setExpandedPillar(isExpanded ? null : pillar.id)}
                  className="flex w-full items-center justify-between px-3 py-2.5 hover:bg-surface-hover transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted">{pillar.framework}</span>
                    <span className="text-xs font-medium">{pillar.label}</span>
                    <span className="text-[10px] text-muted">{pillar.tags.length} tags</span>
                  </div>
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"
                    className={`opacity-40 transition-transform duration-150 ${isExpanded ? "rotate-90" : ""}`}>
                    <path d="M6 3l5 5-5 5V3z"/>
                  </svg>
                </button>
                {isExpanded && (
                  <div className="px-3 pb-3 border-t border-border space-y-3">
                    <p className="text-[9px] text-muted pt-2">{pillar.description ? "AI-generated description" : "The craft, skill, or service itself"}</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[9px] text-muted mb-1">Industry Label</label>
                        <input
                          value={pillar.label}
                          onChange={e => updatePillar(pillar.id, { label: e.target.value })}
                          className="w-full rounded border border-border bg-background px-2.5 py-1.5 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] text-muted mb-1">ID (fixed)</label>
                        <input value={pillar.id} readOnly className="w-full rounded border border-border bg-surface-hover px-2.5 py-1.5 text-xs text-muted" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[9px] text-muted mb-1">AI Description</label>
                      <textarea
                        value={pillar.description}
                        onChange={e => updatePillar(pillar.id, { description: e.target.value })}
                        ref={el => { if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; } }}
                        className="w-full rounded border border-border bg-background px-2.5 py-1.5 text-xs resize-none overflow-hidden"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] text-muted mb-1">Tags (4-6 recommended)</label>
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {pillar.tags.map(tag => (
                          <span key={tag.id} className="flex items-center gap-1 rounded bg-surface-hover px-2.5 py-1 text-xs">
                            {tag.label}
                            <button onClick={() => removeTag(pillar.id, tag.id)} className="text-muted hover:text-danger text-[10px]">×</button>
                          </span>
                        ))}
                        <div className="flex items-center gap-1">
                          <input
                            value={tagInput[pillar.id] || ""}
                            onChange={e => setTagInput(prev => ({ ...prev, [pillar.id]: e.target.value }))}
                            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTag(pillar.id); } }}
                            placeholder="+ Tag"
                            className="rounded border border-border bg-background px-2 py-1 text-xs w-24"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-[10px] text-muted">No content pillars configured. Generate the brand playbook first.</p>
      )}

      {pillars.length > 0 && (
        <div className="flex justify-end mt-3">
          <button
            onClick={save}
            disabled={saving}
            className="bg-accent px-4 py-1.5 text-[10px] font-medium text-white rounded hover:bg-accent-hover disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Pillars"}
          </button>
          {saved && <span className="ml-2 text-[10px] text-success">Saved</span>}
        </div>
      )}
    </div>
  );
}

export default function ManageCopyGenPage() {
  return (
    <ManagePage title="Copy Generation" requireSite>
      {({ siteId }) => <CopyGenContent siteId={siteId} />}
    </ManagePage>
  );
}
