"use client";

import { useState } from "react";
import { AssetEditModal } from "./asset-edit-modal";
import type { PillarGroup } from "./tag-picker";

interface Asset {
  id: string;
  storage_url: string;
  media_type: string;
  context_note: string | null;
  triage_status: string;
  quality_score: number | null;
  content_pillar: string | null;
  content_pillars: string[] | null;
  content_tags: string[] | null;
  source: string | null;
  flag_reason: string | null;
  created_at: string;
}

const statusColors: Record<string, string> = {
  received: "bg-muted/70 text-white",
  ready: "bg-success/70 text-white",
  triaged: "bg-accent/70 text-white",
  scheduled: "bg-success/70 text-white",
  consumed: "bg-success/70 text-white",
  shelved: "bg-warning/70 text-white",
  flagged: "bg-danger/70 text-white",
  rejected: "bg-danger/70 text-white",
};

interface Vendor {
  id: string;
  name: string;
  slug: string;
  url: string | null;
}

export function MediaGrid({
  initialAssets,
  availablePillars,
  pillarConfig,
  siteId,
  vendors = [],
  assetVendorMap = {},
}: {
  initialAssets: Asset[];
  availablePillars: string[];
  pillarConfig: PillarGroup[];
  siteId: string;
  vendors?: Vendor[];
  assetVendorMap?: Record<string, string[]>;
}) {
  const [assets, setAssets] = useState(initialAssets);
  const [editing, setEditing] = useState<Asset | null>(null);

  function handleSaved(note: string, pillar: string, tags: string[]) {
    if (!editing) return;
    setAssets((prev) =>
      prev.map((a) =>
        a.id === editing.id
          ? { ...a, context_note: note, content_pillar: pillar || a.content_pillar, content_tags: tags.length > 0 ? tags : a.content_tags }
          : a
      )
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {assets.map((a) => (
          <button
            key={a.id}
            onClick={() => setEditing(a)}
            className="group relative overflow-hidden rounded-lg border border-border bg-surface text-left transition-colors hover:border-accent/40"
          >
            <div className="relative aspect-square bg-background">
              {a.media_type === "video" ? (
                <video
                  src={a.storage_url}
                  className="h-full w-full object-cover"
                  muted
                  playsInline
                  preload="metadata"
                  onMouseEnter={(e) => (e.target as HTMLVideoElement).play().catch(() => {})}
                  onMouseLeave={(e) => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0; }}
                />
              ) : a.storage_url?.endsWith(".heic") || a.storage_url?.endsWith(".heif") ? (
                <div className="flex h-full w-full items-center justify-center text-xs text-muted">
                  HEIC — processing
                </div>
              ) : (
                <img
                  src={a.storage_url}
                  alt={a.context_note || ""}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              )}
              <span
                className={`absolute left-1.5 top-1.5 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                  statusColors[a.triage_status] || "bg-muted/20 text-muted"
                }`}
              >
                {a.triage_status}
              </span>
              {a.media_type === "video" && (
                <span className="absolute right-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                  video
                </span>
              )}
              {a.source === "ai_generated" && (
                <span className="absolute right-1.5 top-1.5 rounded bg-accent/70 px-1.5 py-0.5 text-[10px] text-white">
                  AI
                </span>
              )}
            </div>
            <div className="px-2.5 py-2">
              {a.context_note ? (
                <p className="truncate text-xs">{a.context_note}</p>
              ) : (
                <p className="truncate text-xs text-muted">No caption</p>
              )}
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] text-muted">
                  {new Date(a.created_at).toLocaleDateString()}
                </span>
                {(a.content_pillars || (a.content_pillar ? [a.content_pillar] : [])).map((p) => (
                  <span key={p} className="rounded bg-surface-hover px-1.5 py-0.5 text-[10px]">
                    {p.replace(/_/g, " ")}
                  </span>
                ))}
                {a.quality_score && (
                  <span className="text-[10px] text-muted">
                    {(a.quality_score * 100).toFixed(0)}%
                  </span>
                )}
              </div>
              {a.flag_reason && (
                <p className="mt-1 text-[10px] text-danger">{a.flag_reason}</p>
              )}
            </div>
          </button>
        ))}
      </div>

      {editing && (
        <AssetEditModal
          assetId={editing.id}
          siteId={siteId}
          imageUrl={editing.storage_url}
          mediaType={editing.media_type}
          initialNote={editing.context_note || ""}
          initialPillar={editing.content_pillar || ""}
          initialTags={editing.content_tags || editing.content_pillars || []}
          pillarConfig={pillarConfig}
          vendors={vendors}
          initialVendorIds={assetVendorMap[editing.id] || []}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}
    </>
  );
}
