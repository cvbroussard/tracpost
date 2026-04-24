"use client";

import { useState, useEffect } from "react";
import { ManagePage } from "@/components/manage/manage-page";

interface Asset {
  id: string;
  url: string;
  type: string;
  source: string;
  status: string;
  quality: number | null;
  context: string | null;
  autoContext: boolean;
}

interface Counts {
  total: number;
  uploads: number;
  ai: number;
  triaged: number;
  pending: number;
  with_context: number;
  without_context: number;
  avg_quality: number;
}

function MediaContent({ siteId }: { siteId: string }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "upload" | "ai" | "untagged">("all");
  const [selected, setSelected] = useState<Asset | null>(null);
  const [editNote, setEditNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/manage/media?site_id=${siteId}`)
      .then(r => r.ok ? r.json() : { assets: [], counts: {} })
      .then(d => { setAssets(d.assets); setCounts(d.counts); })
      .finally(() => setLoading(false));
  }, [siteId]);

  const filtered = filter === "all" ? assets
    : filter === "upload" ? assets.filter(a => a.source === "upload")
    : filter === "ai" ? assets.filter(a => a.source === "ai_generated")
    : assets.filter(a => !a.context);

  async function saveContext(assetId: string) {
    setSaving(true);
    await fetch(`/api/assets/${assetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context_note: editNote }),
    });
    setAssets(prev => prev.map(a => a.id === assetId ? { ...a, context: editNote } : a));
    setSelected(null);
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  function qualityColor(q: number | null): string {
    if (!q) return "text-muted";
    if (q >= 0.8) return "text-success";
    if (q >= 0.5) return "text-warning";
    return "text-danger";
  }

  return (
    <div className="p-4 space-y-4">
      {counts && (
        <div className="grid grid-cols-5 gap-2">
          <div className="rounded-lg border border-border bg-surface-hover p-3 text-center">
            <p className="text-lg font-semibold">{counts.total}</p>
            <p className="text-[10px] text-muted">Total</p>
          </div>
          <div className="rounded-lg border border-border bg-surface-hover p-3 text-center">
            <p className="text-lg font-semibold">{counts.uploads}</p>
            <p className="text-[10px] text-muted">Uploads</p>
          </div>
          <div className="rounded-lg border border-border bg-surface-hover p-3 text-center">
            <p className="text-lg font-semibold">{counts.ai}</p>
            <p className="text-[10px] text-muted">AI Generated</p>
          </div>
          <div className="rounded-lg border border-border bg-surface-hover p-3 text-center">
            <p className="text-lg font-semibold text-success">{counts.triaged}</p>
            <p className="text-[10px] text-muted">Triaged</p>
          </div>
          <div className="rounded-lg border border-border bg-surface-hover p-3 text-center">
            <p className={`text-lg font-semibold ${counts.avg_quality >= 0.7 ? "text-success" : "text-warning"}`}>
              {counts.avg_quality ? Math.round(counts.avg_quality * 100) : "—"}%
            </p>
            <p className="text-[10px] text-muted">Avg Quality</p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        {(["all", "upload", "ai", "untagged"] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded px-3 py-1 text-[10px] font-medium ${
              filter === f ? "bg-accent text-white" : "bg-surface-hover text-muted hover:text-foreground"
            }`}
          >
            {f === "all" ? `All (${assets.length})`
              : f === "upload" ? `Uploads (${assets.filter(a => a.source === "upload").length})`
              : f === "ai" ? `AI (${assets.filter(a => a.source === "ai_generated").length})`
              : `Untagged (${assets.filter(a => !a.context).length})`}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: "6px" }}>
        {filtered.map(asset => (
          <div
            key={asset.id}
            onClick={() => { setSelected(asset); setEditNote(asset.context || ""); }}
            className={`relative aspect-square rounded-lg overflow-hidden border cursor-pointer transition-colors ${
              selected?.id === asset.id ? "border-accent ring-2 ring-accent/30" : "border-border hover:border-accent/50"
            }`}
          >
            {asset.type === "video" ? (
              <>
                <video
                  src={asset.url}
                  preload="metadata"
                  muted
                  style={{ width: "100%", height: "100%", objectFit: "cover", position: "absolute", inset: "0" }}
                />
                <span className="absolute inset-0 flex items-center justify-center">
                  <span className="rounded-full bg-black/50 p-3 text-white text-lg">▶</span>
                </span>
              </>
            ) : (
              <img
                src={asset.url}
                alt={asset.context || ""}
                loading="lazy"
                style={{ width: "100%", height: "100%", objectFit: "cover", position: "absolute", inset: "0" }}
              />
            )}
            <span className="absolute top-1 right-1 rounded bg-black/60 px-1 py-0.5 text-[8px] font-mono text-white">
              {asset.quality ? Math.round(asset.quality * 100) : "—"}
            </span>
            <span className={`absolute top-1 left-1 h-1.5 w-1.5 rounded-full ${
              asset.status === "triaged" ? "bg-success" : "bg-warning"
            }`} />
            {!asset.context && (
              <span className="absolute bottom-1 left-1 rounded bg-danger/80 px-1 py-0.5 text-[7px] text-white">
                No context
              </span>
            )}
          </div>
        ))}
      </div>

      {selected && (() => {
        const idx = filtered.findIndex(a => a.id === selected.id);
        const hasPrev = idx > 0;
        const hasNext = idx < filtered.length - 1;
        function nav(dir: -1 | 1) {
          const next = filtered[idx + dir];
          if (next) { setSelected(next); setEditNote(next.context || ""); }
        }

        return (
          <div className="rounded-xl border border-accent/30 bg-surface p-4 shadow-card">
            <div className="flex gap-4">
              <div className="shrink-0" style={{ width: 280 }}>
                {selected.type === "video" ? (
                  <video src={selected.url} controls preload="metadata" className="rounded-lg w-full" />
                ) : (
                  <img src={selected.url} alt={selected.context || ""} className="rounded-lg w-full" loading="lazy" />
                )}
              </div>
              <div className="flex-1 space-y-3">
                {/* Navigation + meta */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs">
                    <span className={`font-medium ${qualityColor(selected.quality)}`}>
                      Quality: {selected.quality ? Math.round(selected.quality * 100) + "%" : "—"}
                    </span>
                    <span className="text-muted">·</span>
                    <span className="text-muted capitalize">{selected.source}</span>
                    <span className="text-muted">·</span>
                    <span className={selected.status === "triaged" ? "text-success" : "text-warning"}>{selected.status}</span>
                    {selected.autoContext && <span className="rounded bg-warning/10 px-1.5 py-0.5 text-[9px] text-warning">Auto-generated</span>}
                    <span className="text-muted">·</span>
                    <span className="text-[10px] text-muted">{idx + 1} of {filtered.length}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => nav(-1)} disabled={!hasPrev} className="rounded border border-border px-2 py-0.5 text-xs text-muted hover:text-foreground disabled:opacity-30">←</button>
                    <button onClick={() => nav(1)} disabled={!hasNext} className="rounded border border-border px-2 py-0.5 text-xs text-muted hover:text-foreground disabled:opacity-30">→</button>
                    <button onClick={() => setSelected(null)} className="rounded border border-border px-2 py-0.5 text-xs text-muted hover:text-foreground ml-1">✕</button>
                  </div>
                </div>

                {/* Context note */}
                <div>
                  <label className="block text-[10px] text-muted mb-1">Context Note</label>
                  <textarea
                    value={editNote}
                    onChange={e => setEditNote(e.target.value)}
                    rows={3}
                    className="w-full rounded border border-border bg-background px-2.5 py-1.5 text-xs focus:border-accent focus:outline-none"
                    placeholder="Describe what's in this photo..."
                  />
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => saveContext(selected.id)}
                    disabled={saving}
                    className="bg-accent px-3 py-1 text-[10px] font-medium text-white rounded hover:bg-accent-hover disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Save Context"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

export default function Page() {
  return (
    <ManagePage title="Media" requireSite>
      {({ siteId }) => <MediaContent siteId={siteId} />}
    </ManagePage>
  );
}
