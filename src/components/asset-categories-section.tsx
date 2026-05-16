"use client";

import { useEffect, useState, useCallback } from "react";

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

interface CategoriesResponse {
  asset: { id: string; hasTranscript: boolean };
  siteCategories: SiteCategory[];
  assignments: Assignment[];
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
  stage1: unknown | null;
  stage2: {
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
}

export function AssetCategoriesSection({ assetId }: { assetId: string }) {
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
      setPreview({ stage1: d.stage1, stage2: d.stage2, brand_match: d.brand_match });
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
        body: JSON.stringify({ stage1: preview.stage1, stage2: preview.stage2 }),
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

  if (loading) {
    return (
      <div className="border-t border-border px-6 py-4">
        <label className="mb-1.5 block text-xs text-muted">Category</label>
        <p className="text-[11px] text-muted">Loading…</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="border-t border-border px-6 py-4">
        <label className="mb-1.5 block text-xs text-muted">Category</label>
        <p className="text-[11px] text-danger">{error || "Failed to load"}</p>
      </div>
    );
  }

  const { siteCategories, assignments, asset } = data;
  const primary = assignments.find((a) => a.is_primary);
  const secondaries = assignments.filter((a) => !a.is_primary);
  const assigned = new Set(assignments.map((a) => a.gcid));
  const addable = siteCategories.filter((c) => !assigned.has(c.gcid));

  return (
    <div className="border-t border-border px-6 py-4">
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-xs text-muted">Category</label>
        {assignments.length > 0 && primary?.assigned_by === "auto" && primary.confidence !== null && (
          <span className="text-[9px] text-muted">
            auto · {(Number(primary.confidence) * 100).toFixed(0)}% confidence
          </span>
        )}
      </div>

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

      {/* Auto-tag CTA — appears when transcript exists but no preview is loaded */}
      {siteCategories.length > 0 && asset.hasTranscript && !preview && (
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

      {/* Cascade preview — primary + secondaries + confidence + reasoning + Apply/Discard */}
      {preview && (
        <div className="mb-3 rounded-lg border border-accent/40 bg-accent/5 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-accent">Preview — not yet saved</span>
            <div className="flex gap-1.5">
              <button
                onClick={commitPreview}
                disabled={committing}
                className="rounded bg-accent px-3 py-1 text-[10px] font-medium text-white hover:bg-accent/90 disabled:opacity-50"
              >
                {committing ? "Applying…" : "✓ Apply"}
              </button>
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
                  ★ {preview.stage2.asset_categories.primary.name}
                </span>
                <span className="text-[9px] tabular-nums text-muted">
                  {(preview.stage2.asset_categories.primary.confidence * 100).toFixed(0)}%
                </span>
              </div>
              <p className="mt-1 text-[10px] leading-relaxed text-muted">
                {preview.stage2.asset_categories.primary.reasoning}
              </p>
            </div>
            {/* Secondaries preview */}
            {preview.stage2.asset_categories.secondaries.map((s) => (
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
              {preview.stage2.scene_types.length > 0 && (
                <div>Scene: {preview.stage2.scene_types.join(", ")}</div>
              )}
              {preview.stage2.story_angles.length > 0 && (
                <div>Angles: {preview.stage2.story_angles.join(", ")}</div>
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
              {preview.stage2.url_slug && (
                <div className="col-span-2">Slug: <code className="text-[9px]">{preview.stage2.url_slug}</code></div>
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

      {/* Assigned pills */}
      {assignments.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {primary && (
            <CategoryPill
              key={primary.gcid}
              assignment={primary}
              isInspecting={inspectingGcid === primary.gcid}
              onInspect={() => setInspectingGcid(inspectingGcid === primary.gcid ? null : primary.gcid)}
              onRemove={() => act("remove", primary.gcid)}
              onSetPrimary={() => {}}
              variant="primary"
            />
          )}
          {secondaries.map((a) => (
            <CategoryPill
              key={a.gcid}
              assignment={a}
              isInspecting={inspectingGcid === a.gcid}
              onInspect={() => setInspectingGcid(inspectingGcid === a.gcid ? null : a.gcid)}
              onRemove={() => act("remove", a.gcid)}
              onSetPrimary={() => act("set_primary", a.gcid)}
              variant="secondary"
            />
          ))}
          {addable.length > 0 && (
            <button
              onClick={() => setPicking(!picking)}
              className="rounded bg-surface-hover px-2 py-0.5 text-xs text-muted hover:text-foreground"
            >
              {picking ? "Cancel" : "+ Add"}
            </button>
          )}
        </div>
      )}

      {/* Picker */}
      {picking && addable.length > 0 && (
        <div className="mt-2 max-h-48 overflow-y-auto rounded border border-border bg-background p-2">
          <div className="flex flex-wrap gap-1.5">
            {addable.map((c) => (
              <button
                key={c.gcid}
                onClick={() => act("add", c.gcid)}
                className="rounded bg-surface px-2 py-0.5 text-xs text-muted hover:bg-accent/10 hover:text-accent"
              >
                + {c.name}
              </button>
            ))}
          </div>
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
