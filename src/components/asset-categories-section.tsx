"use client";

import { useEffect, useState, useCallback, forwardRef, useImperativeHandle } from "react";

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
  service_area_suggestions: Array<{ name: string; kind: string }>;
  /** Full asset_analysis JSONB — what the cascade actually wrote. Used
   * by the "View raw JSON" inspector at the bottom of the card. */
  raw_analysis: Record<string, unknown> | null;
  /** JIT-computed service area matcher output (matched + suggested_new).
   * Not persisted; recomputed every read. Shown raw alongside analysis. */
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
    suggested_new: Array<{
      name: string;
      kind: string;
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
  const [picking, setPicking] = useState(false);
  const [inspectingGcid, setInspectingGcid] = useState<string | null>(null);

  // Cascade preview state (decoupled auto-tag flow)
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<CascadePreview | null>(null);
  const [committing, setCommitting] = useState(false);
  const [cascadeError, setCascadeError] = useState<string | null>(null);
  const [rawOpen, setRawOpen] = useState(false);
  // Force-remount key + defaultOpenDepth let Expand/Collapse All reset
  // every CollapsibleNode's internal state at once. Bump treeKey to
  // re-mount the tree with the new defaultOpenDepth.
  const [treeKey, setTreeKey] = useState(0);
  const [defaultOpenDepth, setDefaultOpenDepth] = useState(2);

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
        service_area_match: d.service_area_match ?? { matched: [], suggested_new: [] },
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

  async function act(action: "add" | "remove" | "set_primary", gcid: string) {
    try {
      const res = await fetch(`/api/assets/${assetId}/categories`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, gcid }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `Failed (${res.status})`);
      }
      await load();
      setPicking(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const wrapperClass = className ?? "border-t border-border px-6 py-4";

  if (loading) {
    return (
      <div className={wrapperClass}>
        {!hideTrigger && <label className="mb-1.5 block text-xs text-muted">Auto-tag</label>}
        <p className="text-[11px] text-muted">Loading…</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={wrapperClass}>
        {!hideTrigger && <label className="mb-1.5 block text-xs text-muted">Auto-tag</label>}
        <p className="text-[11px] text-danger">{error || "Failed to load"}</p>
      </div>
    );
  }

  const { siteCategories, assignments, asset, committed } = data;
  const primary = assignments.find((a) => a.is_primary);
  const secondaries = assignments.filter((a) => !a.is_primary);
  const assigned = new Set(assignments.map((a) => a.gcid));
  const addable = siteCategories.filter((c) => !assigned.has(c.gcid));

  return (
    <div className={wrapperClass}>
      {!hideTrigger && (
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-xs text-muted">Auto-tag</label>
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
          Pending briefing. Record audio or add a context note, then click Auto-tag below.
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
            {previewing ? "Analyzing…" : assignments.length === 0 ? "⚡ Auto-tag this asset" : "⚡ Re-categorize"}
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
          <div className="space-y-2">
            {/* Primary preview */}
            <div className="rounded border border-accent/30 bg-background px-2.5 py-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold">
                  ★ {preview.analysis.asset_categories.primary.name}
                </span>
                <span className="text-[9px] tabular-nums text-muted">
                  {(preview.analysis.asset_categories.primary.confidence * 100).toFixed(0)}%
                </span>
              </div>
              <p className="mt-1 text-[10px] leading-relaxed text-muted">
                {preview.analysis.asset_categories.primary.reasoning}
              </p>
            </div>
            {/* Secondaries preview */}
            {preview.analysis.asset_categories.secondaries.map((s) => (
              <div key={s.gcid} className="rounded border border-border bg-background px-2.5 py-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs">{s.name}</span>
                  <span className="text-[9px] tabular-nums text-muted">
                    {(s.confidence * 100).toFixed(0)}%
                  </span>
                </div>
                <p className="mt-1 text-[10px] leading-relaxed text-muted">{s.reasoning}</p>
              </div>
            ))}
            {/* Brief glimpse of other cascade outputs */}
            <div className="grid grid-cols-2 gap-1.5 pt-1 text-[10px] text-muted">
              {preview.analysis.scene_types.length > 0 && (
                <div>Scene: {preview.analysis.scene_types.join(", ")}</div>
              )}
              {preview.analysis.story_angles.length > 0 && (
                <div>Angles: {preview.analysis.story_angles.join(", ")}</div>
              )}
              {preview.brand_match.matched.length > 0 && (
                <div className="col-span-2">
                  Brands (catalog): {preview.brand_match.matched.map((m) => `${m.name} ← "${m.ner_text}"`).join(", ")}
                </div>
              )}
              {preview.brand_match.suggested_new.length > 0 && (
                <div className="col-span-2 text-amber-700">
                  New brand candidates: {preview.brand_match.suggested_new.map((s) => s.name).join(", ")}
                </div>
              )}
              {preview.service_area_match.matched.length > 0 && (
                <div className="col-span-2">
                  Service areas: {preview.service_area_match.matched.map((s) => `${s.name}${s.source === "gps" ? " 📍" : ""}`).join(", ")}
                </div>
              )}
              {preview.service_area_match.suggested_new.length > 0 && (
                <div className="col-span-2 text-amber-700">
                  New area candidates: {preview.service_area_match.suggested_new.map((s) => `${s.name} (${s.kind})`).join(", ")}
                </div>
              )}
              {preview.analysis.url_slug && (
                <div className="col-span-2">Slug: <code className="text-[9px]">{preview.analysis.url_slug}</code></div>
              )}
            </div>
          </div>
        </div>
      )}

      {cascadeError && (
        <div className="mb-2 rounded border border-danger/40 bg-danger/5 px-3 py-2 text-[11px] text-danger">
          {cascadeError}
        </div>
      )}

      {/* Committed cascade artifact, read-only. Single-column layout.
          Categories first (primary highlighted via ★ glyph), then the
          rest of the cascade outputs each on its own row. No pills,
          no clicks, no Add — this is a review surface, not an input
          surface (2026-05-17). To re-trigger the cascade, click the
          ⚡ Auto-tag button in the bar. */}
      {assignments.length > 0 && (
        <div className="space-y-1 text-[11px] text-foreground">
          {primary && (
            <div>
              <span className="text-muted">Category: </span>
              <span className="font-medium">★ {primary.name}</span>
              {primary.confidence !== null && (
                <span className="ml-1 text-[10px] text-muted">
                  · {(Number(primary.confidence) * 100).toFixed(0)}%
                </span>
              )}
            </div>
          )}
          {secondaries.length > 0 && (
            <div>
              <span className="text-muted">Also: </span>
              <span>{secondaries.map((s) => s.name).join(", ")}</span>
            </div>
          )}
        </div>
      )}

      {/* Committed cascade extras — each on its own row, read-only. */}
      {committed && (
        <div className="mt-2 space-y-1 border-t border-border pt-2 text-[11px] text-muted">
          {committed.scene_types.length > 0 && (
            <div>
              <span className="text-muted/70">Scene: </span>
              <span className="text-foreground/90">{committed.scene_types.join(", ")}</span>
            </div>
          )}
          {committed.story_angles.length > 0 && (
            <div>
              <span className="text-muted/70">Angles: </span>
              <span className="text-foreground/90">{committed.story_angles.join(", ")}</span>
            </div>
          )}
          {committed.brands.length > 0 && (
            <div>
              <span className="text-muted/70">Brands: </span>
              <span className="text-foreground/90">{committed.brands.map((b) => b.name).join(", ")}</span>
            </div>
          )}
          {committed.service_areas.length > 0 && (
            <div>
              <span className="text-muted/70">Service areas: </span>
              <span className="text-foreground/90">
                {committed.service_areas
                  .map((s) => `${s.name}${s.source === "gps" ? " 📍" : ""}`)
                  .join(", ")}
              </span>
            </div>
          )}
          {committed.service_area_suggestions.length > 0 && (
            <div className="text-amber-700">
              <span>New area candidates: </span>
              <span>
                {committed.service_area_suggestions
                  .map((s) => `${s.name} (${s.kind})`)
                  .join(", ")}
              </span>
            </div>
          )}
          {committed.suggested_pillar && (
            <div>
              <span className="text-muted/70">Pillar: </span>
              <span className="text-foreground/90">{committed.suggested_pillar}</span>
            </div>
          )}
          {committed.url_slug && (
            <div>
              <span className="text-muted/70">Slug: </span>
              <code className="text-[10px] text-foreground/90">{committed.url_slug}</code>
            </div>
          )}
        </div>
      )}

      {/* Raw cascade JSON inspector. Toggle reveals the full artifact
          (asset_analysis + JIT service-area match) as nicely-formatted
          JSON. Useful for debugging and for power-users who want to
          see exactly what the cascade produced. */}
      {committed?.raw_analysis && (
        <div className="mt-2 border-t border-border pt-2">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setRawOpen((v) => !v)}
              className="flex items-center gap-1 text-[10px] text-muted hover:text-accent"
            >
              <span className="inline-block w-2 text-center">{rawOpen ? "▾" : "▸"}</span>
              <span>{rawOpen ? "Hide raw JSON" : "View raw JSON"}</span>
            </button>
            {rawOpen && (
              <div className="flex items-center gap-2 text-[10px] text-muted">
                <button
                  onClick={() => {
                    setDefaultOpenDepth(999);
                    setTreeKey((k) => k + 1);
                  }}
                  className="hover:text-accent"
                >
                  Expand all
                </button>
                <span className="text-muted/40">·</span>
                <button
                  onClick={() => {
                    setDefaultOpenDepth(0);
                    setTreeKey((k) => k + 1);
                  }}
                  className="hover:text-accent"
                >
                  Collapse all
                </button>
              </div>
            )}
          </div>
          {rawOpen && (
            <div
              key={treeKey}
              className="mt-2 max-h-96 overflow-auto rounded border border-border bg-background p-3 font-mono text-[10px] leading-relaxed"
            >
              <JsonView
                value={{
                  analysis: committed.raw_analysis,
                  service_area_match: committed.raw_service_area_match,
                }}
                defaultOpenDepth={defaultOpenDepth}
              />
            </div>
          )}
        </div>
      )}

      {/* Reasoning inspector (collapsible per pill) */}
      {inspectingGcid && (() => {
        const a = assignments.find((x) => x.gcid === inspectingGcid);
        if (!a) return null;
        return (
          <div className="mt-2 rounded border border-border bg-background px-3 py-2">
            <p className="text-[10px] text-muted">
              {a.assigned_by === "auto" ? "Auto-categorized" : `Set by ${a.assigned_by}`}
              {" · "}
              {new Date(a.assigned_at).toLocaleString()}
              {a.confidence !== null && ` · ${(Number(a.confidence) * 100).toFixed(0)}% confidence`}
            </p>
            {a.reasoning && <p className="mt-1 text-[11px] leading-relaxed">{a.reasoning}</p>}
          </div>
        );
      })()}

      {error && <p className="mt-2 text-[10px] text-danger">{error}</p>}
    </div>
  );
});

/**
 * Lightweight JSON tree viewer — recursive, syntax-colored, collapsible
 * at each object/array level. Keeps presentation tight (text-[10px]
 * font-mono) so big artifacts fit a max-h-96 scroll container without
 * dominating the asset modal.
 */
function JsonView({
  value,
  depth = 0,
  defaultOpenDepth = 2,
}: {
  value: unknown;
  depth?: number;
  defaultOpenDepth?: number;
}) {
  const indent = depth * 12;

  if (value === null) return <span className="text-muted">null</span>;
  if (value === undefined) return <span className="text-muted">undefined</span>;
  if (typeof value === "boolean") return <span className="text-amber-700">{String(value)}</span>;
  if (typeof value === "number") return <span className="text-accent">{value}</span>;
  if (typeof value === "string") return <span className="text-success">&quot;{value}&quot;</span>;

  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-muted">[]</span>;
    return (
      <CollapsibleNode
        summary={`[${value.length}]`}
        defaultOpen={depth < defaultOpenDepth}
        openBrace="["
        closeBrace="]"
        indent={indent}
      >
        {value.map((item, i) => (
          <div key={i} style={{ paddingLeft: indent + 12 }}>
            <span className="text-muted">{i}: </span>
            <JsonView value={item} depth={depth + 1} defaultOpenDepth={defaultOpenDepth} />
            {i < value.length - 1 ? <span className="text-muted">,</span> : null}
          </div>
        ))}
      </CollapsibleNode>
    );
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return <span className="text-muted">{"{}"}</span>;
    return (
      <CollapsibleNode
        summary={`{${entries.length}}`}
        defaultOpen={depth < defaultOpenDepth}
        openBrace="{"
        closeBrace="}"
        indent={indent}
      >
        {entries.map(([k, v], i) => (
          <div key={k} style={{ paddingLeft: indent + 12 }}>
            <span className="text-foreground/90">&quot;{k}&quot;</span>
            <span className="text-muted">: </span>
            <JsonView value={v} depth={depth + 1} defaultOpenDepth={defaultOpenDepth} />
            {i < entries.length - 1 ? <span className="text-muted">,</span> : null}
          </div>
        ))}
      </CollapsibleNode>
    );
  }

  return <span>{String(value)}</span>;
}

function CollapsibleNode({
  summary,
  defaultOpen,
  openBrace,
  closeBrace,
  indent,
  children,
}: {
  summary: string;
  defaultOpen: boolean;
  openBrace: string;
  closeBrace: string;
  indent: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (!open) {
    return (
      <span className="inline-flex items-baseline gap-1">
        <button
          onClick={() => setOpen(true)}
          className="text-muted hover:text-accent"
        >
          ▸ {openBrace}…{closeBrace}
        </button>
        <span className="text-[9px] text-muted/70">{summary}</span>
      </span>
    );
  }
  return (
    <>
      <button
        onClick={() => setOpen(false)}
        className="text-muted hover:text-accent"
      >
        ▾ {openBrace}
      </button>
      {children}
      <div style={{ paddingLeft: indent }} className="text-muted">
        {closeBrace}
      </div>
    </>
  );
}

function CategoryPill({
  assignment,
  isInspecting,
  onInspect,
  onRemove,
  onSetPrimary,
  variant,
}: {
  assignment: Assignment;
  isInspecting: boolean;
  onInspect: () => void;
  onRemove: () => void;
  onSetPrimary: () => void;
  variant: "primary" | "secondary";
}) {
  const isPrimary = variant === "primary";
  return (
    <div className="group relative inline-flex items-center gap-1">
      <button
        onClick={onInspect}
        title={assignment.reasoning || undefined}
        className={`flex items-center gap-1 rounded px-2 py-0.5 text-xs transition-colors ${
          isPrimary
            ? "bg-accent text-white"
            : "bg-accent/15 text-accent ring-1 ring-accent/30"
        } ${isInspecting ? "ring-2 ring-accent/60" : ""}`}
      >
        {isPrimary && <span>★</span>}
        {assignment.name}
      </button>
      {!isPrimary && (
        <button
          onClick={onSetPrimary}
          title="Make primary"
          className="text-[9px] text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-accent"
        >
          ★
        </button>
      )}
      <button
        onClick={onRemove}
        title="Remove"
        className="text-[9px] text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-danger"
      >
        ✕
      </button>
    </div>
  );
}
