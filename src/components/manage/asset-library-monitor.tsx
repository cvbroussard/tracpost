"use client";

import { useState, useEffect } from "react";

interface Asset {
  id: string;
  url: string;
  type: string;
  source: string;
  status: string;
  quality: number | null;
  context: string | null;
  autoContext: boolean;
  brands: string[];
  projects: string[];
}

interface Counts {
  total: number;
  uploads: number;
  ai: number;
  briefed: number;
  pending_briefing: number;
  with_context: number;
  without_context: number;
  avg_quality: number;
}

// processing_stage enum (migration #235): uploaded → onboarded → briefed → analyzed, plus failed.
const STAGE_META: Record<string, { label: string; badge: string }> = {
  uploaded:  { label: "Uploaded",       badge: "bg-black/60 text-white" },
  onboarded: { label: "Needs briefing", badge: "bg-amber-500 text-white" },
  briefed:   { label: "Briefed",        badge: "bg-accent text-white" },
  analyzed:  { label: "Analyzed",       badge: "bg-success text-white" },
  failed:    { label: "Failed",         badge: "bg-danger text-white" },
};

function stageMeta(status: string) {
  return STAGE_META[status] ?? { label: status || "unknown", badge: "bg-black/60 text-white" };
}

function qualityColor(q: number | null): string {
  if (!q) return "text-muted";
  if (q >= 0.8) return "text-success";
  if (q >= 0.5) return "text-warning";
  return "text-danger";
}

export function AssetLibraryMonitor({ siteId }: { siteId: string }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "upload" | "ai" | "onboarded" | "untagged">("all");
  const [selected, setSelected] = useState<Asset | null>(null);

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
    : filter === "onboarded" ? assets.filter(a => a.status === "onboarded")
    : assets.filter(a => !a.context);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {counts && (
        <div className="grid grid-cols-6 gap-2">
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
            <p className="text-lg font-semibold text-success">{counts.briefed}</p>
            <p className="text-[10px] text-muted">Briefed</p>
          </div>
          <div className={`rounded-lg border p-3 text-center ${
            counts.pending_briefing > 0
              ? "border-amber-500/40 bg-amber-500/10"
              : "border-border bg-surface-hover"
          }`}>
            <p className={`text-lg font-semibold ${counts.pending_briefing > 0 ? "text-amber-400" : "text-muted"}`}>
              {counts.pending_briefing}
            </p>
            <p className="text-[10px] text-muted">Needs briefing</p>
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
        {(["all", "upload", "ai", "onboarded", "untagged"] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded px-3 py-1 text-[10px] font-medium ${
              filter === f ? "bg-accent text-white" : "bg-surface-hover text-muted hover:text-foreground"
            } ${f === "onboarded" && filter !== f && counts && counts.pending_briefing > 0 ? "ring-1 ring-amber-500/40" : ""}`}
          >
            {f === "all" ? `All (${assets.length})`
              : f === "upload" ? `Uploads (${assets.filter(a => a.source === "upload").length})`
              : f === "ai" ? `AI (${assets.filter(a => a.source === "ai_generated").length})`
              : f === "onboarded" ? `Needs briefing (${assets.filter(a => a.status === "onboarded").length})`
              : `Untagged (${assets.filter(a => !a.context).length})`}
          </button>
        ))}
      </div>

      {/* Operator note: this view is monitor-only. Briefing happens in the
          subscriber's media library at /dashboard/media (see briefing-required
          principle). When a subscriber's pending_briefing count is high,
          coach them via the customer-success channel — don't brief for them. */}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: "6px" }}>
        {filtered.map(asset => {
          const stage = stageMeta(asset.status);
          return (
            <div
              key={asset.id}
              onClick={() => setSelected(asset)}
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
              <span className={`absolute top-1 left-1 rounded px-1 py-0.5 text-[8px] font-medium leading-none ${stage.badge}`}>
                {stage.label}
              </span>
              {!asset.context && (
                <span className="absolute bottom-1 left-1 rounded bg-danger/80 px-1 py-0.5 text-[7px] text-white">
                  No context
                </span>
              )}
            </div>
          );
        })}
      </div>

      {selected && (<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setSelected(null)}>
        <div className="w-full max-w-2xl mx-4" onClick={e => e.stopPropagation()}>
      {(() => {
        const idx = filtered.findIndex(a => a.id === selected.id);
        const hasPrev = idx > 0;
        const hasNext = idx < filtered.length - 1;
        const selStage = stageMeta(selected.status);
        function nav(dir: -1 | 1) {
          const next = filtered[idx + dir];
          if (next) { setSelected(next); }
        }

        return (
          <div className="rounded-xl border border-accent/30 bg-surface p-4 shadow-card">
            <div className="mb-3 flex items-center gap-2 rounded border border-muted/30 bg-muted/5 px-2.5 py-1.5">
              <span className="text-[9px] font-mono uppercase tracking-wide text-muted">monitor only</span>
              <span className="text-[10px] text-muted leading-snug">
                Operator view — coach the subscriber to brief their own assets. Edits happen in /dashboard/media.
              </span>
            </div>
            <div className="flex gap-4">
              <div className="shrink-0 space-y-2" style={{ width: 280 }}>
                {selected.type === "video" ? (
                  <video src={selected.url} controls preload="metadata" className="rounded-lg w-full" />
                ) : (
                  <img src={selected.url} alt={selected.context || ""} className="rounded-lg w-full" loading="lazy" />
                )}

                {/* Tags below image */}
                <div className="space-y-1">
                  {selected.projects.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {selected.projects.map((p, i) => (
                        <span key={i} className="rounded bg-accent/10 px-1.5 py-0.5 text-[9px] text-accent">{p}</span>
                      ))}
                    </div>
                  )}
                  {selected.brands.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {selected.brands.map((b, i) => (
                        <span key={i} className="rounded bg-success/10 px-1.5 py-0.5 text-[9px] text-success">{b}</span>
                      ))}
                    </div>
                  )}
                  {selected.projects.length === 0 && selected.brands.length === 0 && (
                    <p className="text-[9px] text-muted">No tags</p>
                  )}
                </div>
              </div>
              <div className="flex-1 space-y-3">
                {/* Meta */}
                <div className="flex items-center gap-2 text-xs flex-wrap">
                  <span className={`font-medium ${qualityColor(selected.quality)}`}>
                    Quality: {selected.quality ? Math.round(selected.quality * 100) + "%" : "—"}
                  </span>
                  <span className="text-muted">·</span>
                  <span className="text-muted capitalize">{selected.source}</span>
                  <span className="text-muted">·</span>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${selStage.badge}`}>{selStage.label}</span>
                  {selected.autoContext && <span className="rounded bg-warning/10 px-1.5 py-0.5 text-[9px] text-warning">Auto-generated</span>}
                </div>

                {/* Context note (read-only, collapsed — marginal value at the monitor stage) */}
                <details>
                  <summary className="cursor-pointer select-none text-[10px] text-muted">
                    Context note {selected.context ? "" : "· none"}
                  </summary>
                  <div className="mt-1 w-full rounded border border-border bg-background px-2.5 py-1.5 text-xs min-h-[3em] whitespace-pre-wrap">
                    {selected.context || <span className="text-muted italic">No briefing yet</span>}
                  </div>
                </details>

                {/* Pagination only — no save/edit per operator-monitor-only policy */}
                <div className="flex items-center justify-end">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-muted mr-1">{idx + 1} of {filtered.length}</span>
                    <button onClick={() => nav(-1)} disabled={!hasPrev} className="rounded border border-border px-2 py-0.5 text-xs text-muted hover:text-foreground disabled:opacity-30">←</button>
                    <button onClick={() => nav(1)} disabled={!hasNext} className="rounded border border-border px-2 py-0.5 text-xs text-muted hover:text-foreground disabled:opacity-30">→</button>
                    <button onClick={() => setSelected(null)} className="rounded border border-border px-2 py-0.5 text-xs text-muted hover:text-foreground ml-1">✕</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
        </div>
      </div>)}
    </div>
  );
}
