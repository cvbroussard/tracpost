"use client";

import { useState, useEffect } from "react";
import { ManagePage } from "@/components/manage/manage-page";
import { CorrectionsPanel } from "@/app/admin/sites/[siteId]/website-pane";

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
    <div className="p-4 space-y-4">
      <div className="grid grid-cols-2 gap-4">
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

        {/* Content corrections */}
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <h3 className="text-sm font-medium mb-1">Content Corrections</h3>
          <p className="text-[10px] text-muted mb-3">Tenant-requested adjustments injected into all future generation prompts.</p>
          <CorrectionsPanel siteId={siteId} />
        </div>
      </div>

      {/* Content pillars */}
      <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium">Content Pillars</h3>
          <span className="text-[10px] text-muted">{configuredCount}/{pillars.length} configured</span>
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
                    <div className="flex items-center gap-3">
                      <div>
                        <span className="text-xs font-medium">{pillar.framework}</span>
                        <span className="ml-2 text-xs text-muted">{pillar.label}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted">{pillar.tags.length} tags</span>
                      <svg
                        width="12" height="12" viewBox="0 0 16 16" fill="currentColor"
                        className={`opacity-40 transition-transform duration-150 ${isExpanded ? "rotate-90" : ""}`}
                      >
                        <path d="M6 3l5 5-5 5V3z"/>
                      </svg>
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="px-3 pb-3 border-t border-border bg-surface-hover">
                      {pillar.description && (
                        <p className="text-[10px] text-muted py-2">{pillar.description}</p>
                      )}
                      <div className="flex flex-wrap gap-1.5">
                        {pillar.tags.map(tag => (
                          <span key={tag.id} className="rounded bg-accent/10 px-2 py-0.5 text-[10px] text-accent">
                            {tag.label}
                          </span>
                        ))}
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
      </div>
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
