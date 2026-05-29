"use client";

import { useState, useEffect } from "react";
import { AnalysisModal } from "@/components/manage/analysis-modal";
import { FocalPointInspectorModal } from "@/components/manage/focal-point-inspector-modal";
import { lifecycleBadge } from "@/lib/lifecycle-badge";
import { cdnImage } from "@/lib/cdn-image";

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

export function AssetLibraryMonitor({ siteId }: { siteId: string }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "upload" | "ai" | "onboarded" | "untagged">("all");
  const [selected, setSelected] = useState<Asset | null>(null);
  const [focalAsset, setFocalAsset] = useState<Asset | null>(null);

  useEffect(() => {
    fetch(`/api/ops/media?site_id=${siteId}`)
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

      {/* The grid monitors the raw-material pool; click a thumbnail to open
          the per-asset Analysis modal. Briefing (recording) stays subscriber-
          side at /dashboard/media — coach, don't brief for them. */}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: "6px" }}>
        {filtered.map(asset => {
          const stage = lifecycleBadge(asset.status);
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
                  src={cdnImage(asset.url, { width: 320 })}
                  alt={asset.context || ""}
                  loading="lazy"
                  style={{ width: "100%", height: "100%", objectFit: "cover", position: "absolute", inset: "0" }}
                />
              )}
              <span className="absolute top-1 right-1 rounded bg-black/60 px-1 py-0.5 text-[8px] font-mono text-white">
                {asset.quality ? Math.round(asset.quality * 100) : "—"}
              </span>
              <span className={`absolute top-1 left-1 rounded px-1 py-0.5 text-[8px] font-medium leading-none ${stage.className}`}>
                {stage.label}
              </span>
              {!asset.context && (
                <span className="absolute bottom-1 left-1 rounded bg-danger/80 px-1 py-0.5 text-[7px] text-white">
                  No context
                </span>
              )}
              {asset.type !== "video" && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setFocalAsset(asset);
                  }}
                  title="Inspect focal point"
                  className="absolute bottom-1 right-1 rounded bg-black px-1.5 py-0.5 text-[9px] font-mono font-bold leading-none text-white shadow-md ring-1 ring-amber-400/40 hover:bg-zinc-900 hover:ring-amber-400/70"
                >
                  ⌖ FP
                </button>
              )}
            </div>
          );
        })}
      </div>

      {selected && (
        <AnalysisModal key={selected.id} assetId={selected.id} onClose={() => setSelected(null)} />
      )}
      {focalAsset && (
        <FocalPointInspectorModal
          key={focalAsset.id}
          assetId={focalAsset.id}
          onClose={() => setFocalAsset(null)}
        />
      )}
    </div>
  );
}
