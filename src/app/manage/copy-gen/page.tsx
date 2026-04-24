"use client";

import { useState, useEffect } from "react";
import { ManagePage } from "@/components/manage/manage-page";
import { CorrectionsPanel } from "@/app/admin/sites/[siteId]/website-pane";

function CopyGenContent({ siteId }: { siteId: string }) {
  const [contentVibe, setContentVibe] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/manage/site?site_id=${siteId}&view=visual`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.site) setContentVibe(d.site.content_vibe || ""); })
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
  );
}

export default function ManageCopyGenPage() {
  return (
    <ManagePage title="Copy Generation" requireSite>
      {({ siteId }) => <CopyGenContent siteId={siteId} />}
    </ManagePage>
  );
}
