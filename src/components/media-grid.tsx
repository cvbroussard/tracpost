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
  ai_analysis: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  flag_reason: string | null;
  render_status: string | null;
  variant_count: number;
  created_at: string;
  archived_at: string | null;
  briefable_at: string | null;
  scene_types: string[] | null;
}

const statusColors: Record<string, string> = {
  pending_briefing: "bg-amber-500/80 text-white",
  received: "bg-muted/70 text-white", // legacy, should not appear post-migrate-099
  ready: "bg-success/70 text-white",
  triaged: "bg-accent/70 text-white",
  scheduled: "bg-success/70 text-white",
  consumed: "bg-success/70 text-white",
  shelved: "bg-warning/70 text-white",
  flagged: "bg-danger/70 text-white",
  quarantined: "bg-danger/70 text-white",
  rejected: "bg-danger/70 text-white",
};

const statusLabels: Record<string, string> = {
  pending_briefing: "needs briefing",
};

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

export function MediaGrid({
  initialAssets,
  availablePillars,
  pillarConfig,
  siteId,
  brands = [],
  projects = [],
  brandLabel = null,
  projectLabel = null,
  assetBrandMap = {},
  assetProjectMap = {},
  assetPersonaMap = {},
  personaLabel = null,
  personaList = [],
}: {
  initialAssets: Asset[];
  availablePillars: string[];
  pillarConfig: PillarGroup[];
  siteId: string;
  brands?: Brand[];
  projects?: Project[];
  brandLabel?: string | null;
  projectLabel?: string | null;
  assetBrandMap?: Record<string, string[]>;
  assetProjectMap?: Record<string, string[]>;
  assetPersonaMap?: Record<string, string[]>;
  personaLabel?: string | null;
  personaList?: Array<{ id: string; name: string; type: string }>;
}) {
  const [assets, setAssets] = useState(initialAssets);
  const [editing, setEditing] = useState<Asset | null>(null);
  const [lastEdited, setLastEdited] = useState<string | null>(null);
  const [liveBrands, setLiveBrands] = useState(brands);
  const [liveProjects, setLiveProjects] = useState(projects);
  const [liveBrandMap, setLiveBrandMap] = useState(assetBrandMap);
  const [liveProjectMap, setLiveProjectMap] = useState(assetProjectMap);
  const [livePersonaMap, setLivePersonaMap] = useState(assetPersonaMap);

  function handleSaved(note: string, pillar: string, tags: string[], brandIds?: string[], projectIds?: string[], personaIds?: string[]) {
    if (!editing) return;
    setAssets((prev) =>
      prev.map((a) =>
        a.id === editing.id
          ? { ...a, context_note: note, content_pillar: pillar || a.content_pillar, content_tags: tags.length > 0 ? tags : a.content_tags }
          : a
      )
    );
    if (brandIds) {
      setLiveBrandMap((prev) => ({ ...prev, [editing.id]: brandIds }));
    }
    if (projectIds) {
      setLiveProjectMap((prev) => ({ ...prev, [editing.id]: projectIds }));
    }
    if (personaIds) {
      setLivePersonaMap((prev) => ({ ...prev, [editing.id]: personaIds }));
    }
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
                {statusLabels[a.triage_status] || a.triage_status}
              </span>
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
            </div>
            {/* Source-card minimalism (2026-05-09): the card's job in the
                grid is fast visual identification + click. Full untruncated
                context note so the subscriber can read what's there at a
                glance; everything else (pillars, brands, projects, dates,
                quality, flag reason) lives in the modal. Filtration carries
                the navigation weight for libraries with thousands of
                assets. Hover tooltip retains the upload date for the rare
                "when did I upload this" question. */}
            <div
              className="px-2.5 py-2"
              title={`Uploaded ${new Date(a.created_at).toLocaleDateString()}`}
            >
              {a.context_note ? (
                <p className="text-xs leading-snug">{a.context_note}</p>
              ) : (
                <p className="text-xs italic text-muted">No caption</p>
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
          initialPillars={editing.content_pillars || []}
          initialSceneTypes={editing.scene_types || []}
          initialTags={editing.content_tags || []}
          pillarConfig={pillarConfig}
          brands={liveBrands}
          projects={liveProjects}
          brandLabel={brandLabel}
          projectLabel={projectLabel}
          initialBrandIds={liveBrandMap[editing.id] || []}
          initialProjectIds={liveProjectMap[editing.id] || []}
          personaLabel={personaLabel}
          initialPersonaIds={livePersonaMap[editing.id] || []}
          onBrandCreated={(brand) => setLiveBrands((prev) => [...prev, brand].sort((a, b) => a.name.localeCompare(b.name)))}
          onProjectCreated={(project) => setLiveProjects((prev) => [...prev, project].sort((a, b) => a.name.localeCompare(b.name)))}
          captionSource={((editing.metadata as Record<string, unknown>)?.caption_source as string) || null}
          initialMetadata={editing.metadata as Record<string, unknown> | null}
          faces={(() => {
            const meta = (editing.metadata || {}) as Record<string, unknown>;
            const fd = meta.faces as { faces: Array<Record<string, unknown>>; detectionWidth?: number; detectionHeight?: number } | undefined;
            return (fd?.faces || null) as Array<{ box: { x: number; y: number; width: number; height: number }; score: number; personaId: string | null; personaName: string | null; distance: number | null; embedding: number[]; index: number }> | null;
          })()}
          faceDetectionWidth={(() => {
            const meta = (editing.metadata || {}) as Record<string, unknown>;
            const fd = meta.faces as { detectionWidth?: number } | undefined;
            return fd?.detectionWidth;
          })()}
          faceDetectionHeight={(() => {
            const meta = (editing.metadata || {}) as Record<string, unknown>;
            const fd = meta.faces as { detectionHeight?: number } | undefined;
            return fd?.detectionHeight;
          })()}
          personas={personaList}
          source={editing.source}
          qualityScore={Number(editing.quality_score) || null}
          sceneType={(editing.ai_analysis as Record<string, unknown>)?.scene_type as string || null}
          archivedAt={editing.archived_at}
          initialAiGenerated={Boolean((editing.metadata as Record<string, unknown> | null)?.ai_generated)}
          aiSuggestedPillar={editing.content_pillar || null}
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
