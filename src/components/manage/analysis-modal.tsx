"use client";

import { useState, useEffect, useMemo } from "react";
import { toast } from "@/components/feedback";
import { useAssetAnalysis } from "@/hooks/use-asset-analysis";
import { makeManageAnalysisApi } from "@/lib/asset-analysis-api";
import { AssetCategoriesSection } from "@/components/asset-categories-section";
import type { PillarGroup } from "@/components/tag-picker";

/** Shape returned by GET /api/ops/asset-analysis/[assetId]. */
interface AnalysisContext {
  subscriptionId: string;
  siteId: string;
  pillarConfig: PillarGroup[];
  brandLabel: string | null;
  projectLabel: string | null;
  serviceLabel: string | null;
  branchLabel: string | null;
  brands: Array<{ id: string; name: string; slug: string; url: string | null }>;
  projects: Array<{ id: string; name: string; slug: string }>;
  services: Array<{ id: string; name: string; slug: string }>;
  branches: Array<{ id: string; name: string; slug: string }>;
  asset: {
    id: string;
    storageUrl: string;
    mediaType: string;
    tags: string[];
    sceneTypes: string[];
    brandIds: string[];
    projectIds: string[];
    serviceIds: string[];
    branchIds: string[];
  };
  transcript: string;
  latestRecordingId: string | null;
}

/**
 * Manager-side Studio › Analysis modal. Opened from the asset-
 * library grid; the operator runs the full multimodal cascade
 * (AssetCategoriesSection) on an asset and commits it. Briefing
 * (recording) is subscriber-only — this modal shows the transcript
 * read-only as the analysis input.
 *
 * The cascade routes authenticate the operator via authenticateRequest
 * Path 3 (?subscription_id=) — the manager adapter appends that suffix.
 * Sign-off is deferred.
 */
export function AnalysisModal({ assetId, onClose }: { assetId: string; onClose: () => void }) {
  const [ctx, setCtx] = useState<AnalysisContext | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/ops/asset-analysis/${assetId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => { if (!cancelled) setCtx(d); })
      .catch((e) => { if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, [assetId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-3xl max-h-[90vh] flex-col border border-border bg-surface overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface px-5 py-3">
          <h3 className="text-sm font-semibold">Asset Analysis</h3>
          <button
            onClick={onClose}
            className="rounded bg-surface-hover px-2 py-1 text-xs text-muted hover:text-foreground"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        {loadError ? (
          <div className="p-6 text-center text-xs text-danger">Failed to load analysis: {loadError}</div>
        ) : !ctx ? (
          <div className="flex justify-center py-16">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          </div>
        ) : (
          <AnalysisModalBody ctx={ctx} onClose={onClose} />
        )}
      </div>
    </div>
  );
}

function AnalysisModalBody({ ctx, onClose }: { ctx: AnalysisContext; onClose: () => void }) {
  const api = useMemo(() => makeManageAnalysisApi(ctx.subscriptionId), [ctx.subscriptionId]);
  const analysis = useAssetAnalysis({
    assetId: ctx.asset.id,
    siteId: ctx.siteId,
    api,
    pillarConfig: ctx.pillarConfig,
    brands: ctx.brands,
    projects: ctx.projects,
    services: ctx.services,
    branches: ctx.branches,
    personas: [],
    initialTags: ctx.asset.tags,
    initialSceneTypes: ctx.asset.sceneTypes,
    initialPillars: [],
    initialPillar: "",
    initialBrandIds: ctx.asset.brandIds,
    initialProjectIds: ctx.asset.projectIds,
    initialServiceIds: ctx.asset.serviceIds,
    initialBranchIds: ctx.asset.branchIds,
    initialPersonaIds: [],
  });
  const [saving, setSaving] = useState(false);

  const isVideo = ctx.asset.mediaType?.startsWith("video") || ctx.asset.mediaType === "video";
  const hasTranscript = ctx.transcript.trim().length >= 5;
  const analyzeDisabled = !hasTranscript || analysis.cascadeBusy;

  // Save commits the loaded cascade preview (no-op if none) — cascade-
  // commit persists asset_analysis, categories, brands, the SEO rename,
  // and flips processing_stage to 'analyzed'.
  async function handleSave() {
    setSaving(true);
    try {
      await analysis.cascadeRef.current?.commitPreview();
      onClose();
    } catch {
      toast.error("Failed to save analysis");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="space-y-3 p-5">
        <div className="overflow-hidden rounded border border-border bg-background">
          {isVideo ? (
            <video src={ctx.asset.storageUrl} controls preload="metadata" className="max-h-[36vh] w-full object-contain" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ctx.asset.storageUrl} alt="" className="max-h-[36vh] w-full object-contain" />
          )}
        </div>

        {/* Transcript — read-only; this is the analysis input. Briefing
            (recording / re-transcribe) stays subscriber-side. */}
        <div className="rounded border border-border bg-background px-3 py-2">
          <div className="mb-1 text-[10px] uppercase tracking-wide text-muted">Transcript (read-only)</div>
          <div className="whitespace-pre-wrap text-xs text-foreground/90">
            {hasTranscript
              ? ctx.transcript
              : <span className="italic text-muted">No transcript — analysis runs on the briefing transcript.</span>}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => analysis.cascadeRef.current?.triggerPreview()}
            disabled={analyzeDisabled}
            className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-40"
          >
            {analysis.cascadeBusy ? "Analyzing…" : "⚡ Analyze"}
          </button>
          {!hasTranscript && <span className="text-[10px] text-muted">Needs a transcript to analyze.</span>}
        </div>

        <AssetCategoriesSection
          ref={analysis.cascadeRef}
          assetId={ctx.asset.id}
          api={api}
          hideTrigger
          onStateChange={analysis.handleCascadeStateChange}
        />
      </div>

      <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-border bg-surface px-5 py-3">
        <button
          onClick={onClose}
          className="rounded border border-border px-3 py-1.5 text-xs text-muted hover:text-foreground"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded bg-accent px-4 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </>
  );
}
