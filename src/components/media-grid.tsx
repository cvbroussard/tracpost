"use client";

import { useState } from "react";
import { AssetEditModal } from "./asset-edit-modal";
import type { PillarGroup } from "./tag-picker";
import { lifecycleBadge } from "@/lib/lifecycle-badge";
import { cdnImage } from "@/lib/cdn-image";

interface Asset {
  id: string;
  storage_url: string;
  media_type: string;
  context_note: string | null;
  /** Latest recording transcript (canonical narrative per
      project_tracpost_recording_as_canonical.md). When present, displays
      under the thumbnail. Falls back to context_note for legacy assets. */
  latest_transcript?: string | null;
  processing_stage: string;
  quality_score: number | null;
  // content_pillar / content_pillars dropped from the asset model
  // (LOCKED 2026-05-09). Pillars derive from content_tags via
  // pillarsFromTags() — the asset stores tags only.
  content_tags: string[] | null;
  source: string | null;
  ai_analysis: Record<string, unknown> | null;
  /** Cascade artifact (asset_analysis JSONB). Presence means the
      asset has been analyzed; absence means brief saved but not yet
      analyzed. Drives the 3-state tile badge. */
  asset_analysis: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  flag_reason: string | null;
  render_status: string | null;
  variant_count: number;
  created_at: string;
  archived_at: string | null;
  briefable_at: string | null;
  scene_types: string[] | null;
}

interface Brand {
  id: string;
  name: string;
  slug: string;
  url: string | null;
}

interface Project {
  id: string;
  name: string;
  slug: string;
}

type SimpleEntity = { id: string; name: string; slug: string };

export function MediaGrid({
  initialAssets,
  siteId,
  projects = [],
  assetProjectMap = {},
}: {
  initialAssets: Asset[];
  /** Pillar inputs + catalog/label/map props retained on the public
      interface for the dashboard page caller, but the briefing-only
      modal (analyze excised 2026-05-22) no longer consumes them. */
  availablePillars?: string[];
  pillarConfig?: PillarGroup[];
  siteId: string;
  brands?: Brand[];
  projects?: Project[];
  services?: SimpleEntity[];
  branches?: SimpleEntity[];
  brandLabel?: string | null;
  projectLabel?: string | null;
  serviceLabel?: string | null;
  branchLabel?: string | null;
  assetBrandMap?: Record<string, string[]>;
  assetProjectMap?: Record<string, string[]>;
  assetPersonaMap?: Record<string, string[]>;
  assetServiceMap?: Record<string, string[]>;
  assetBranchMap?: Record<string, string[]>;
  personaLabel?: string | null;
  personaList?: Array<{ id: string; name: string; type: string }>;
}) {
  const [assets, setAssets] = useState(initialAssets);
  const [editing, setEditing] = useState<Asset | null>(null);
  const [lastEdited, setLastEdited] = useState<string | null>(null);
  const [liveProjects] = useState(projects);
  const [liveProjectMap] = useState(assetProjectMap);

  // Briefing-only modal (analyze excised 2026-05-22): the modal persists
  // its own changes (recordings + project binding) via API and signals
  // completion with a no-arg callback. Tile state stays as-is — the grid
  // re-fetches on the next navigation.
  function handleSaved() {
    /* no-op refresh hook — kept for future tile re-fetch wiring */
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {assets.map((a) => (
          <button
            key={a.id}
            onClick={() => {
              // Block briefing while asset is still preparing (HEIC convert
              // pending or video poster pending). Otherwise the modal would
              // show a broken preview and a save would fail mid-pipeline.
              if (!a.briefable_at) return;
              setEditing(a);
              setLastEdited(a.id);
            }}
            disabled={!a.briefable_at}
            className={`group relative flex flex-col overflow-hidden rounded-lg border bg-surface text-left transition-colors ${
              !a.briefable_at
                ? "cursor-wait border-border opacity-70"
                : lastEdited === a.id
                ? "border-accent ring-1 ring-accent"
                : "border-border hover:border-accent/40"
            }`}
          >
            <div className="relative aspect-square bg-background">
              {a.source === "pdf" && (
                <span className="absolute left-1.5 bottom-1.5 z-10 rounded bg-accent/70 px-1.5 py-0.5 text-[9px] text-white">
                  PDF p.{((a.metadata as Record<string, unknown>)?.pdf_page as number) || "?"}
                </span>
              )}
              {a.media_type === "video" ? (
                /* Static first-frame preview only. No play-on-hover — the
                   video element would otherwise eat the click and stick the
                   wait cursor on the card. pointer-events-none lets the
                   parent <button> own the entire card surface. */
                <video
                  src={a.storage_url}
                  className="pointer-events-none h-full w-full object-cover"
                  muted
                  playsInline
                  preload="metadata"
                />
              ) : a.media_type === "pdf" ? (
                <a
                  href={a.storage_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-full w-full flex-col items-center justify-center gap-2 bg-surface text-muted hover:bg-surface-hover"
                  onClick={(e) => e.stopPropagation()}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  <span className="text-[11px] font-medium">
                    {((a.metadata as Record<string, unknown>)?.pdf_total_pages as number) || ""} page PDF
                  </span>
                  <span className="text-[10px] underline">Open</span>
                </a>
              ) : !a.briefable_at ? (
                /* Preparing: HEIC waiting on convert, or video waiting on
                   poster gen. Generalized via briefable_at (migration #103)
                   so the placeholder works for any future prep step too. */
                <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-xs text-muted">
                  <div className="h-3 w-3 animate-spin rounded-full border border-muted border-t-transparent" />
                  <span>Preparing…</span>
                </div>
              ) : (
                <img
                  src={cdnImage(a.storage_url, { width: 400 })}
                  alt={a.context_note || ""}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              )}
              {(() => {
                const b = lifecycleBadge(a.processing_stage);
                return (
                  <span
                    className={`absolute left-1.5 top-1.5 rounded px-1.5 py-0.5 text-[10px] font-medium ${b.className}`}
                  >
                    {b.label}
                  </span>
                );
              })()}
              {a.media_type === "video" && (
                <span
                  className={`absolute top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white ${
                    a.source === "ai_generated" ? "right-9" : "right-1.5"
                  }`}
                >
                  video
                </span>
              )}
              {a.source === "ai_generated" && (
                <span className="absolute right-1.5 top-1.5 rounded bg-accent/70 px-1.5 py-0.5 text-[10px] text-white">
                  AI
                </span>
              )}
              {(() => {
                // Face count badge — bottom-right. Surfaces detected
                // faces from the privacy pipeline so subscribers can
                // visually scan / filter face-bearing assets. Click
                // → modal Privacy section explains what happens at
                // publish time.
                const meta = (a.metadata as Record<string, unknown> | null) || {};
                const fd = meta.face_detection as { face_count?: number } | undefined;
                const count = fd?.face_count ?? 0;
                if (count <= 0) return null;
                return (
                  <span
                    className="absolute right-1.5 bottom-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white"
                    title={`${count} face${count === 1 ? "" : "s"} detected`}
                  >
                    👤 {count}
                  </span>
                );
              })()}
            </div>
            {/* Tile caption = recording transcript (canonical narrative).
                Fixed-height container + line-clamp keeps every card the
                same overall height regardless of how long the narration
                is. Hover tooltip carries the upload date. */}
            <div
              className="h-16 px-2.5 py-2"
              title={`Uploaded ${new Date(a.created_at).toLocaleDateString()}`}
            >
              {a.latest_transcript ? (
                <p className="line-clamp-4 text-xs leading-snug">{a.latest_transcript}</p>
              ) : (
                <p className="text-xs italic text-muted">No transcription</p>
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
          projects={liveProjects}
          initialProjectIds={liveProjectMap[editing.id] || []}
          captionSource={((editing.metadata as Record<string, unknown>)?.caption_source as string) || null}
          initialMetadata={editing.metadata as Record<string, unknown> | null}
          source={editing.source}
          archivedAt={editing.archived_at}
          initialAiGenerated={Boolean((editing.metadata as Record<string, unknown> | null)?.ai_generated)}
          aiVerifications={(() => {
            const meta = (editing.metadata || {}) as Record<string, unknown>;
            const v = meta.ai_verifications;
            return Array.isArray(v) ? (v as Array<{ field: string; value: unknown; status: "confirmed" | "rejected"; verified_at?: string }>) : null;
          })()}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
          onNext={() => {
            const idx = assets.findIndex((a) => a.id === editing.id);
            if (idx < assets.length - 1) {
              setLastEdited(assets[idx + 1].id);
              setEditing(assets[idx + 1]);
            }
          }}
          onPrev={() => {
            const idx = assets.findIndex((a) => a.id === editing.id);
            if (idx > 0) {
              setLastEdited(assets[idx - 1].id);
              setEditing(assets[idx - 1]);
            }
          }}
          hasNext={assets.findIndex((a) => a.id === editing.id) < assets.length - 1}
          hasPrev={assets.findIndex((a) => a.id === editing.id) > 0}
          onDeleted={() => {
            setAssets((prev) => prev.filter((a) => a.id !== editing.id));
            setEditing(null);
          }}
        />
      )}
    </>
  );
}
