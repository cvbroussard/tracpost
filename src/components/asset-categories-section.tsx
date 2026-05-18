"use client";

import { useEffect, useState, useCallback, forwardRef, useImperativeHandle } from "react";
import { JsonViewer } from "./json-viewer";

/**
 * Imperative handle exposed via ref. The Auto-tag bar's trigger button
 * calls triggerPreview() to fire the cascade preview without owning
 * the cascade state itself.
 */
export interface AutoTagSectionHandle {
  triggerPreview: () => void;
  /** Commits the currently-loaded preview (writes asset_analysis,
   * asset_categories, asset_brands, R2 rename, variant render).
   * No-op if no preview is loaded. Used by the modal-level Save to
   * unify the two-step Apply+Save ceremony into one. */
  commitPreview: () => Promise<void>;
  /** True when a preview is loaded (cascade ran, awaiting commit). */
  hasPreview: boolean;
  /** True during the preview LLM call. */
  isPreviewing: boolean;
}

interface SiteCategory {
  gcid: string;
  name: string;
}

interface Assignment {
  gcid: string;
  name: string;
  is_primary: boolean;
  confidence: number | null;
  assigned_by: "auto" | "operator" | "subscriber";
  reasoning: string | null;
  assigned_at: string;
}

interface CommittedExtras {
  scene_types: string[];
  story_angles: string[];
  url_slug: string;
  suggested_pillar: string | null;
  brands: Array<{ name: string; slug: string }>;
  service_areas: Array<{ name: string; source: "transcript" | "gps" }>;
  /** Full asset_analysis JSONB — what the cascade actually wrote. */
  raw_analysis: Record<string, unknown> | null;
  /** Matcher outputs (matched + suggested_new), recomputed at read
   * time so preview and committed share a uniform shape. brand/project
   * results also live in asset_brands/asset_projects but this is the
   * inspector-friendly form. */
  raw_brand_match: Record<string, unknown> | null;
  raw_project_match: Record<string, unknown> | null;
  raw_service_area_match: Record<string, unknown> | null;
}

interface CategoriesResponse {
  asset: { id: string; hasTranscript: boolean };
  siteCategories: SiteCategory[];
  assignments: Assignment[];
  committed: CommittedExtras | null;
}

/**
 * Asset modal section for GBP category assignments.
 *
 * Replaces the services tag group per #223 — categories ARE the
 * canonical structured tag now (per project_tracpost_gbp_categories
 * _coaching memory).
 *
 * Auto-assigned at briefing-complete by the multimodal categorizer
 * (image + transcript → ranked gcids). Operator/subscriber overrides
 * are preserved across re-categorization.
 *
 * Display:
 *   - Primary category pill (★ marker)
 *   - Secondary pills (rare — only when LLM confidence ≥0.85)
 *   - Empty state if no transcript yet ("pending briefing")
 *   - Empty state if no site categories ("complete categories coaching first")
 *   - Confidence + reasoning on hover/click (inspector mode)
 *   - "Add another" picker drops down to site's remaining categories
 *   - "Set as primary" + "Remove" actions per existing pill
 */
interface CascadePreview {
  analysis: {
    asset_categories: {
      primary: { gcid: string; name: string; confidence: number; reasoning: string };
      secondaries: Array<{ gcid: string; name: string; confidence: number; reasoning: string }>;
    };
    scene_types: string[];
    url_slug: string;
    story_angles: string[];
    suggested_pillar: string | null;
    caption_hints: { tone: string; voice_anchor: string; key_phrases_to_use: string[]; audience: string; lead_with: string };
  };
  brand_match: {
    matched: Array<{ brand_id: string; name: string; ner_text: string; context: string }>;
    suggested_new: Array<{ name: string; slug: string; context: string }>;
  };
  project_match: {
    matched: Array<{ project_id: string; name: string; slug: string; ner_text: string; context: string }>;
    suggested_new: Array<{ name: string; slug: string; context: string }>;
    geo_candidates: Array<{ project_id: string; name: string; slug: string; project_lat: number; project_lng: number; distance_m: number }>;
  };
  service_area_match: {
    matched: Array<{
      overlay_id: string;
      canonical_id: string;
      name: string;
      place_id: string | null;
      kind: string;
      source: "transcript" | "gps";
      context: string;
    }>;
  };
}

interface AssetCategoriesSectionProps {
  assetId: string;
  /** When true, the section's internal "⚡ Auto-tag this asset" trigger
   * button is suppressed. Use this when the Auto-tag bar renders its own
   * trigger button (the canonical surface 2026-05-16). The bar drives
   * preview via the imperative handle. */
  hideTrigger?: boolean;
  /** Optional className passthrough so the parent (e.g. Auto-tag bar
   * body) can override the default border-t/px-6 padding. */
  className?: string;
  /** Notified whenever cascade preview state changes (isPreviewing /
   * hasPreview). Refs alone don't re-render the parent — the bar uses
   * this to update its trigger button label + disabled state. */
  onStateChange?: (state: { isPreviewing: boolean; hasPreview: boolean }) => void;
}

export const AssetCategoriesSection = forwardRef<AutoTagSectionHandle, AssetCategoriesSectionProps>(
  function AssetCategoriesSection({ assetId, hideTrigger = false, className, onStateChange }, ref) {
  const [data, setData] = useState<CategoriesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Cascade preview state (decoupled auto-tag flow)
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<CascadePreview | null>(null);
  const [committing, setCommitting] = useState(false);
  const [cascadeError, setCascadeError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!assetId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/assets/${assetId}/categories`);
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      const d = (await res.json()) as CategoriesResponse;
      setData(d);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [assetId]);

  useEffect(() => {
    load();
  }, [load]);

  // Expose imperative trigger so the Auto-tag bar (parent) can fire
  // preview from its own button without owning the cascade state.
  useImperativeHandle(
    ref,
    () => ({
      triggerPreview: () => { void runPreview(); },
      commitPreview: async () => {
        if (preview) await commitPreview();
      },
      hasPreview: preview !== null,
      isPreviewing: previewing,
    }),
    [preview, previewing],
  );

  // Notify parent of state changes — refs alone don't trigger re-renders.
  useEffect(() => {
    onStateChange?.({ isPreviewing: previewing, hasPreview: preview !== null });
  }, [previewing, preview, onStateChange]);

  async function runPreview() {
    setPreviewing(true);
    setCascadeError(null);
    setPreview(null);
    try {
      const res = await fetch(`/api/assets/${assetId}/categorize/preview`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const d = await res.json();
      if (!res.ok || !d.ok) {
        throw new Error(d.error || `Preview failed (${res.status})`);
      }
      setPreview({
        analysis: d.analysis,
        brand_match: d.brand_match,
        project_match: d.project_match ?? { matched: [], suggested_new: [], geo_candidates: [] },
        service_area_match: d.service_area_match ?? { matched: [] },
      });
    } catch (e) {
      setCascadeError(e instanceof Error ? e.message : String(e));
    } finally {
      setPreviewing(false);
    }
  }

  async function commitPreview() {
    if (!preview) return;
    setCommitting(true);
    setCascadeError(null);
    try {
      const res = await fetch(`/api/assets/${assetId}/categorize/commit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ analysis: preview.analysis }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || `Commit failed (${res.status})`);
      // Clear preview state + reload current assignments
      setPreview(null);
      await load();
    } catch (e) {
      setCascadeError(e instanceof Error ? e.message : String(e));
    } finally {
      setCommitting(false);
    }
  }

  function discardPreview() {
    setPreview(null);
    setCascadeError(null);
  }

  const wrapperClass = className ?? "border-t border-border px-6 py-4";

  if (loading) {
    return (
      <div className={wrapperClass}>
        {!hideTrigger && <label className="mb-1.5 block text-xs text-muted">Analyze</label>}
        <p className="text-[11px] text-muted">Loading…</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={wrapperClass}>
        {!hideTrigger && <label className="mb-1.5 block text-xs text-muted">Analyze</label>}
        <p className="text-[11px] text-danger">{error || "Failed to load"}</p>
      </div>
    );
  }

  const { siteCategories, assignments, asset, committed } = data;
  const primary = assignments.find((a) => a.is_primary);

  return (
    <div className={wrapperClass}>
      {!hideTrigger && (
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-xs text-muted">Analyze</label>
          {assignments.length > 0 && primary?.assigned_by === "auto" && primary.confidence !== null && (
            <span className="text-[9px] text-muted">
              auto · {(Number(primary.confidence) * 100).toFixed(0)}% confidence
            </span>
          )}
        </div>
      )}

      {/* Empty states */}
      {siteCategories.length === 0 && (
        <div className="rounded border border-dashed border-border bg-background px-3 py-2 text-[11px] text-muted">
          No GBP categories declared for this site. Categories will be available after the operator
          completes categories coaching for this site.
        </div>
      )}

      {siteCategories.length > 0 && assignments.length === 0 && !asset.hasTranscript && (
        <div className="rounded border border-dashed border-border bg-background px-3 py-2 text-[11px] text-muted">
          Pending brief. Record audio or add a context note, then click Analyze below.
        </div>
      )}

      {/* Auto-tag CTA — appears when transcript exists but no preview is loaded.
          Suppressed when hideTrigger=true (the Auto-tag bar above renders
          the canonical trigger button and calls triggerPreview() via ref). */}
      {!hideTrigger && siteCategories.length > 0 && asset.hasTranscript && !preview && (
        <div className="mb-2">
          <button
            onClick={runPreview}
            disabled={previewing || committing}
            className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-50"
          >
            {previewing ? "Analyzing…" : assignments.length === 0 ? "⚡ Analyze this asset" : "⚡ Re-analyze"}
          </button>
          {assignments.length === 0 && (
            <span className="ml-2 text-[10px] text-muted">
              Multimodal AI · transcript + image → ranked categories (~$0.025, ~10s)
            </span>
          )}
        </div>
      )}

      {/* Cascade preview — primary + secondaries + confidence + reasoning.
          When hideTrigger=true (Auto-tag bar mode, 2026-05-16) the
          Apply button is suppressed; the modal-level Save commits the
          preview via the imperative handle's commitPreview(). Discard
          stays so subscriber can clear preview before Save fires. */}
      {/* Preview render — when Analyze runs, the cascade result shows
          as the full JSON viewer. No curated highlight cards (the
          viewer IS the inspector). Save above commits via the
          imperative handle; Discard clears the preview here. */}
      {preview && (
        <div className="mb-3 rounded-lg border border-accent/40 bg-accent/5 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-accent">
              {hideTrigger ? "Preview — Save above to commit" : "Preview — not yet saved"}
            </span>
            <div className="flex gap-1.5">
              {!hideTrigger && (
                <button
                  onClick={commitPreview}
                  disabled={committing}
                  className="rounded bg-accent px-3 py-1 text-[10px] font-medium text-white hover:bg-accent/90 disabled:opacity-50"
                >
                  {committing ? "Applying…" : "✓ Apply"}
                </button>
              )}
              <button
                onClick={discardPreview}
                disabled={committing}
                className="rounded bg-surface-hover px-3 py-1 text-[10px] text-muted hover:text-foreground disabled:opacity-50"
              >
                Discard
              </button>
            </div>
          </div>
          <JsonViewer
            value={preview}
            defaultOpenDepth={1}
            className="max-h-[28rem]"
          />
        </div>
      )}

      {cascadeError && (
        <div className="mb-2 rounded border border-danger/40 bg-danger/5 px-3 py-2 text-[11px] text-danger">
          {cascadeError}
        </div>
      )}

      {/* Committed analysis — full JSON viewer is the only render of
          results. Replaces the prior curated summary cards (2026-05-18).
          The viewer's own Expand/Collapse All buttons handle depth. */}
      {committed?.raw_analysis && (
        <JsonViewer
          value={{
            analysis: committed.raw_analysis,
            // Matchers default to their empty shape when the server
            // returns null/undefined — guarantees the section renders
            // with structure (matched: [], suggested_new: [], etc.)
            // instead of vanishing. Subscriber sees that the matcher
            // ran but found nothing, vs. ambiguity about whether the
            // matcher fired at all.
            brand_match: committed.raw_brand_match ?? {
              matched: [],
              suggested_new: [],
            },
            project_match: committed.raw_project_match ?? {
              matched: [],
              suggested_new: [],
              geo_candidates: [],
            },
            service_area_match: committed.raw_service_area_match ?? {
              matched: [],
            },
          }}
          defaultOpenDepth={1}
          className="mt-2 max-h-[28rem]"
        />
      )}

      {error && <p className="mt-2 text-[10px] text-danger">{error}</p>}
    </div>
  );
});
