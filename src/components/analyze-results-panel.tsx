"use client";

import { SCENE_TYPES } from "@/lib/scene-types";
import type { PillarGroup } from "@/components/tag-picker";
import type { AssetAnalysis, InspectorTagGroup } from "@/hooks/use-asset-analysis";

interface AnalyzeResultsPanelProps {
  analysis: AssetAnalysis;
  pillarConfig: PillarGroup[];
  brandLabel?: string | null;
  projectLabel?: string | null;
  branchLabel?: string | null;
  /** Seed recording id passed to confirmNewEntity — the latest recording on
      the subscriber side; from the analysis aggregator on the manager side. */
  latestRecordingId: string | null;
}

/**
 * The auto-tag inspector — the Analyze-results display. Shared by the
 * subscriber asset modal and the manager-side Studio › Analysis
 * modal. Reads the useAssetAnalysis return and renders Story Angle / Scene
 * Composition / per-group applied + suggested-new pills. Panel renders even
 * when zero matches surfaced so the operator can tell the system ran.
 */
export function AnalyzeResultsPanel({
  analysis,
  pillarConfig,
  brandLabel,
  projectLabel,
  branchLabel,
  latestRecordingId,
}: AnalyzeResultsPanelProps) {
  const {
    autoTagging,
    lastSuggestRunAt,
    inspectorState,
    autoAppliedTagCount,
    autoAppliedTagIds,
    autoAppliedSceneTypeIds,
    nerWarnings,
    tags,
    setTags,
    sceneTypesArr,
    setSceneTypesArr,
    brandIds,
    setBrandIds,
    savedBrandIds,
    projectIds,
    setProjectIds,
    savedProjectIds,
    branchIds,
    setBranchIds,
    savedBranchIds,
    confirmNewEntity,
    dismissAllSuggestions,
  } = analysis;

  // Null lastSuggestRunAt = never ran this session.
  if (!autoTagging && lastSuggestRunAt === null) return null;

  // Services group dropped 2026-05-16 — categories own the structured-tag
  // role. Personas dropped 2026-05-19.
  const groupConfig: Array<{ key: InspectorTagGroup; label: string; toggleSet: (fn: (prev: string[]) => string[]) => void; selectedSet: string[]; savedSet: string[] }> = [
    { key: "brand", label: brandLabel || "Brands", toggleSet: setBrandIds, selectedSet: brandIds, savedSet: savedBrandIds },
    { key: "project", label: projectLabel || "Projects", toggleSet: setProjectIds, selectedSet: projectIds, savedSet: savedProjectIds },
    { key: "branch", label: branchLabel || "Locations", toggleSet: setBranchIds, selectedSet: branchIds, savedSet: savedBranchIds },
  ];
  const totalApplied = inspectorState
    ? groupConfig.reduce((sum, g) => sum + (inspectorState[g.key]?.applied_matches.length || 0), 0)
    : 0;
  const totalNew = inspectorState
    ? groupConfig.reduce((sum, g) => sum + (inspectorState[g.key]?.suggested_new.length || 0), 0)
    : 0;

  return (
    <div className="mb-3 rounded border border-accent/40 bg-accent/5 px-3 py-2.5">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-medium text-accent">
          {autoTagging ? "✨ Analyzing your recording…" : "✨ Analyze results"}
        </span>
        {!autoTagging && (
          <button
            type="button"
            onClick={dismissAllSuggestions}
            className="text-[10px] text-muted hover:text-foreground"
          >
            Dismiss
          </button>
        )}
      </div>
      {!autoTagging && (autoAppliedTagCount > 0 || totalApplied > 0) && (
        <div className="mb-2 text-[10px] text-success">
          {autoAppliedTagCount > 0 && `Applied ${autoAppliedTagCount} Story Angle tag${autoAppliedTagCount > 1 ? "s" : ""}`}
          {autoAppliedTagCount > 0 && totalApplied > 0 && " · "}
          {totalApplied > 0 && `Linked ${totalApplied} existing tag${totalApplied > 1 ? "s" : ""} to this asset`}
        </div>
      )}
      {!autoTagging && nerWarnings.length > 0 && (
        <div className="mb-2 text-[10px] text-warning">
          ⚠ Heads up — review these auto-matches before saving (uncheck any that look wrong): {nerWarnings.join(" · ")}
        </div>
      )}
      {/* Story Angle pills — story angles flow into content_tags, not the
          asset_* join tables, so they render separately from the groups. */}
      {!autoTagging && autoAppliedTagIds.length > 0 && (() => {
        const labelByTagId = new Map(
          pillarConfig.flatMap((p) => p.tags.map((t) => [t.id, t.label] as const))
        );
        return (
          <div className="mb-2">
            <div className="mb-0.5 text-[10px] uppercase tracking-wide text-muted">Story Angles</div>
            <div className="flex flex-wrap items-start gap-1.5">
              {autoAppliedTagIds.map((tagId) => {
                const label = labelByTagId.get(tagId) || tagId;
                const stillSelected = tags.includes(tagId);
                return (
                  <button
                    key={`story:${tagId}`}
                    type="button"
                    onClick={() => setTags((prev) => stillSelected ? prev.filter((id) => id !== tagId) : [...prev, tagId])}
                    className={`rounded px-2 py-0.5 text-[11px] transition-colors ${
                      stillSelected
                        ? "bg-accent/20 text-accent ring-1 ring-accent/40"
                        : "bg-surface-hover text-muted hover:text-foreground"
                    }`}
                  >
                    ✓ {label}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}
      {/* Scene Composition pills — closed-enum visual depiction layer. */}
      {!autoTagging && autoAppliedSceneTypeIds.length > 0 && (
        <div className="mb-2">
          <div className="mb-0.5 text-[10px] uppercase tracking-wide text-muted">Scene Composition</div>
          <div className="flex flex-wrap items-start gap-1.5">
            {autoAppliedSceneTypeIds.map((sceneId) => {
              const scene = SCENE_TYPES.find((s) => s.id === sceneId);
              const label = scene?.label || sceneId;
              const stillSelected = sceneTypesArr.includes(sceneId);
              return (
                <button
                  key={`scene:${sceneId}`}
                  type="button"
                  onClick={() => setSceneTypesArr((prev) => stillSelected ? prev.filter((id) => id !== sceneId) : [...prev, sceneId])}
                  title={scene?.description}
                  className={`rounded px-2 py-0.5 text-[11px] transition-colors ${
                    stillSelected
                      ? "bg-accent/20 text-accent ring-1 ring-accent/40"
                      : "bg-surface-hover text-muted hover:text-foreground"
                  }`}
                >
                  ✓ {label}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {!autoTagging && inspectorState && groupConfig.map((g) => {
        const groupData = inspectorState[g.key];
        if (!groupData) return null;
        if (groupData.applied_matches.length === 0 && groupData.suggested_new.length === 0) return null;
        return (
          <div key={g.key} className="mb-2">
            <div className="mb-0.5 text-[10px] uppercase tracking-wide text-muted">{g.label}</div>
            <div className="flex flex-wrap items-start gap-1.5">
              {groupData.applied_matches.map((m) => {
                const selected = g.selectedSet.includes(m.entity_id);
                const confirmed = selected && g.savedSet.includes(m.entity_id);
                const preselected = selected && !confirmed;
                // Provenance: match_text "📍 GPS" → GPS-derived (asset EXIF
                // coords matched a service-area viewport). Else transcript-
                // derived (NER + catalog match). The badge explains WHY.
                const isGpsDerived = m.match_text === "📍 GPS";
                const provenanceBadge = isGpsDerived ? "📍" : "🎤";
                const provenanceTitle = isGpsDerived
                  ? `From photo location: ${m.context_excerpt}`
                  : `From transcript: ${m.context_excerpt}`;
                return (
                  <button
                    key={`applied:${m.entity_id}`}
                    type="button"
                    onClick={() => g.toggleSet((prev) => selected ? prev.filter((id) => id !== m.entity_id) : [...prev, m.entity_id])}
                    title={provenanceTitle}
                    className={`rounded px-2 py-0.5 text-[11px] transition-colors ${
                      confirmed
                        ? "bg-accent text-white"
                        : preselected
                          ? "bg-accent/20 text-accent ring-1 ring-accent/40"
                          : "bg-surface-hover text-muted hover:text-foreground"
                    }`}
                  >
                    ✓ {m.name} <span className="opacity-60 text-[9px]">{provenanceBadge}</span>
                  </button>
                );
              })}
              {groupData.suggested_new.map((s) => (
                <button
                  key={`new:${s.slug}`}
                  type="button"
                  onClick={() => void confirmNewEntity(g.key, s, latestRecordingId)}
                  title={s.source === "keyword" ? `Keyword "${s.keyword}" — ${s.context}` : s.context}
                  className="rounded bg-surface-hover px-2 py-0.5 text-[11px] text-foreground transition-colors hover:bg-accent/20 hover:text-accent"
                >
                  + {s.name}
                  {s.source === "keyword" && (
                    <span className="ml-1 text-[9px] text-muted">({s.keyword})</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        );
      })}
      {!autoTagging && totalApplied === 0 && totalNew === 0 && autoAppliedTagCount === 0 && (
        <div className="text-[10px] italic text-muted">
          No tag matches detected in this recording. (Try mentioning specific brand names, project names, service names, or city names if you expected suggestions.)
        </div>
      )}
      {!autoTagging && (totalApplied > 0 || totalNew > 0) && (
        <div className="mt-1 text-[10px] text-muted">
          Tap ✓ pills to uncheck false matches. Tap + pills to add new entries. Save to commit.
        </div>
      )}
    </div>
  );
}
