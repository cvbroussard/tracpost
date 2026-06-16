"use client";

import { useState, useEffect, useCallback } from "react";
import { CmaRequiredBlocker } from "./cma-required-blocker";

type CoachedAction = "keep" | "add" | "drop" | "promote_to_primary";

interface CoachedCategory {
  gcid: string;
  name: string;
  action: CoachedAction;
  proposedPrimary: boolean;
  confidence: number;
  reasoning: string;
}

interface CoachingData {
  categories: CoachedCategory[];
  summary: {
    keep: number;
    add: number;
    drop: number;
    implicitlyDropped?: Array<{ gcid: string; name: string; wasPrimary: boolean }>;
    primaryChanged: boolean;
    currentPrimaryGcid: string | null;
    proposedPrimaryGcid: string | null;
  };
  generatedAt: string;
  sourceAnalysisId: string;
}

interface CoachingRun {
  id: string;
  status: "pending" | "running" | "complete" | "failed";
  generated_at: string;
  applied: boolean;
  applied_at: string | null;
  applied_by: string | null;
  coaching_data: CoachingData | null;
  source_analysis_id: string | null;
  error_message: string | null;
}

export function CategoriesCoachingClient({ siteId }: { siteId: string }) {
  const [run, setRun] = useState<CoachingRun | null>(null);
  const [loading, setLoading] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appliedNotice, setAppliedNotice] = useState<string | null>(null);
  const [cmaBlocker, setCmaBlocker] = useState<{ code: "no_cma" | "no_tier2"; message: string } | null>(null);

  const loadRun = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/category-coaching/${siteId}`);
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      const d = await res.json();
      setRun(d.run);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    setAppliedNotice(null);
    loadRun();
  }, [loadRun]);

  // Poll while a run is in flight
  useEffect(() => {
    if (!run || (run.status !== "running" && run.status !== "pending")) return;
    const id = setInterval(loadRun, 5000);
    return () => clearInterval(id);
  }, [run, loadRun]);

  async function triggerRun() {
    if (!siteId) return;
    setTriggering(true);
    setAppliedNotice(null);
    setCmaBlocker(null);
    setError(null);
    try {
      const res = await fetch(`/api/admin/category-coaching/${siteId}/run`, { method: "POST" });
      if (res.status === 412) {
        const d = (await res.json().catch(() => null)) as
          | { error: string; code?: "no_cma" | "no_tier2"; message?: string }
          | null;
        if (d?.error === "cma_required" && d.code && d.message) {
          setCmaBlocker({ code: d.code, message: d.message });
          return;
        }
      }
      if (!res.ok && res.status !== 202) throw new Error(`Trigger failed (${res.status})`);
      // Brief delay then refresh — the runner inserts the row at status='running' as first step
      setTimeout(loadRun, 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTriggering(false);
    }
  }

  async function applyRun() {
    if (!siteId || !run) return;
    if (!confirm("Apply this plan to the site's GBP categories?\n\nThis replaces site_gbp_categories with the 10-best plan and marks gbp_sync_dirty=true. The push to Google fires on the next sync cycle.")) return;
    setApplying(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/category-coaching/${siteId}/apply`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId: run.id }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || `Apply failed (${res.status})`);
      setAppliedNotice(`Applied ${d.applied} categories. Primary: ${d.primaryGcid || "(none)"}. GBP push pending on next sync.`);
      await loadRun();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="space-y-4 p-4">
      {cmaBlocker && <CmaRequiredBlocker code={cmaBlocker.code} message={cmaBlocker.message} />}
      {/* Trigger panel */}
      <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <p className="text-[10px] text-muted leading-relaxed">
              Requires a completed CMA — run one manually via Competitive Analysis first.
              Coaching itself takes ~30-60s once the CMA is in place.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {run && (
              <span className="text-[10px] text-muted">
                {run.status === "complete" && `Last run: ${new Date(run.generated_at).toLocaleString()}`}
                {run.status === "running" && <span className="text-accent">⏳ Running…</span>}
                {run.status === "pending" && <span className="text-muted">Queued…</span>}
                {run.status === "failed" && <span className="text-danger">✗ Failed</span>}
              </span>
            )}
            <button
              onClick={triggerRun}
              disabled={triggering || !siteId || run?.status === "running"}
              className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {triggering ? "Triggering…" : run ? "Regenerate plan" : "Generate plan"}
            </button>
          </div>
        </div>
        {error && <p className="mt-2 text-[10px] text-danger">{error}</p>}
        {run?.error_message && run.status === "failed" && (
          <p className="mt-2 text-[10px] text-danger">Last error: {run.error_message}</p>
        )}
        {appliedNotice && (
          <p className="mt-2 rounded bg-success/10 px-2 py-1 text-[10px] text-success">✓ {appliedNotice}</p>
        )}
      </div>

      {loading && !run && (
        <div className="rounded-xl border border-border bg-surface p-6 text-center text-xs text-muted shadow-card">
          Loading…
        </div>
      )}

      {run === null && !loading && (
        <div className="rounded-xl border border-border bg-surface p-6 text-center shadow-card">
          <p className="text-xs text-muted">No categories plan exists for this site yet.</p>
          <p className="mt-1 text-[10px] text-muted">Click &quot;Generate plan&quot; to produce the 10-best GBP categories recommendation.</p>
        </div>
      )}

      {run?.status === "complete" && run.coaching_data && (
        <CoachingDisplay
          data={run.coaching_data}
          applied={run.applied}
          appliedAt={run.applied_at}
          onApply={applyRun}
          applying={applying}
        />
      )}
    </div>
  );
}

function CoachingDisplay({
  data,
  applied,
  appliedAt,
  onApply,
  applying,
}: {
  data: CoachingData;
  applied: boolean;
  appliedAt: string | null;
  onApply: () => void;
  applying: boolean;
}) {
  return (
    <div className="space-y-4">
      {/* Summary banner */}
      <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-wrap gap-3 text-xs">
            <span className="rounded bg-background px-2 py-1">Keep: <b>{data.summary.keep}</b></span>
            <span className="rounded bg-success/10 px-2 py-1 text-success">Add: <b>{data.summary.add}</b></span>
            <span className="rounded bg-danger/10 px-2 py-1 text-danger">
              Drop: <b>{data.summary.drop + (data.summary.implicitlyDropped?.length || 0)}</b>
              {(data.summary.implicitlyDropped?.length || 0) > 0 && (
                <span className="ml-1 opacity-75">
                  ({data.summary.drop} explicit + {data.summary.implicitlyDropped!.length} implicit)
                </span>
              )}
            </span>
            {data.summary.primaryChanged ? (
              <span className="rounded bg-warning/10 px-2 py-1 text-warning">
                Primary: <b>{(data.summary.currentPrimaryGcid || "(none)").replace("gcid:", "")}</b> → <b>{(data.summary.proposedPrimaryGcid || "(none)").replace("gcid:", "")}</b>
              </span>
            ) : (
              <span className="rounded bg-background px-2 py-1 text-muted">
                Primary unchanged: <b>{(data.summary.proposedPrimaryGcid || "(none)").replace("gcid:", "")}</b>
              </span>
            )}
          </div>
          <div>
            {applied ? (
              <span className="text-[10px] text-success">✓ Applied {appliedAt && new Date(appliedAt).toLocaleString()}</span>
            ) : (
              <button
                onClick={onApply}
                disabled={applying}
                className="rounded bg-success px-3 py-1.5 text-xs font-medium text-white hover:bg-success/90 disabled:opacity-50"
              >
                {applying ? "Applying…" : "Apply to GBP categories"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* The 10-best plan. Sort order: PRIMARY first (visually distinguished
          as the heaviest anchor), then secondaries by LLM-reported confidence
          descending. The LLM's emitted array order isn't deterministic on this
          axis — the sort here makes the display predictable across runs. */}
      <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
        <h3 className="mb-3 text-sm font-medium">10-Best Category Plan</h3>
        <div className="space-y-2">
          {[...data.categories]
            .sort((a, b) => {
              if (a.proposedPrimary && !b.proposedPrimary) return -1;
              if (!a.proposedPrimary && b.proposedPrimary) return 1;
              return (b.confidence ?? 0) - (a.confidence ?? 0);
            })
            .map((c, i) => (
              <CategoryCard key={c.gcid} cat={c} index={i + 1} />
            ))}
        </div>
      </div>

      {/* Will-remove section: categories absent from the new 10 that will be dropped on apply */}
      {data.summary.implicitlyDropped && data.summary.implicitlyDropped.length > 0 && (
        <div className="rounded-xl border border-danger/30 bg-danger/5 p-4 shadow-card">
          <h3 className="mb-1 text-sm font-medium text-danger">
            Will be removed on apply ({data.summary.implicitlyDropped.length})
          </h3>
          <p className="mb-3 text-[11px] text-muted">
            These categories are currently on the site but were not included in the new 10-best plan.
            Applying replaces site_gbp_categories with the plan, which removes them.
          </p>
          <div className="space-y-1">
            {data.summary.implicitlyDropped.map((c) => (
              <div key={c.gcid} className="flex items-center gap-2 text-xs">
                <span className="text-danger">✗</span>
                <span className="font-medium">{c.name}</span>
                <code className="text-[9px] text-muted">{c.gcid}</code>
                {c.wasPrimary && (
                  <span className="rounded bg-warning/20 px-1.5 py-0.5 text-[9px] text-warning">★ was PRIMARY</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Metadata footer */}
      <div className="rounded-xl border border-border bg-surface p-3 text-[10px] text-muted shadow-card">
        Generated {new Date(data.generatedAt).toLocaleString()} · Source CMA: <code>{data.sourceAnalysisId.slice(0, 8)}</code>
      </div>
    </div>
  );
}

function CategoryCard({ cat, index }: { cat: CoachedCategory; index: number }) {
  const styles = {
    keep: { border: "border-l-border", bg: "bg-background", icon: " ", label: "KEEP" },
    add: { border: "border-l-success", bg: "bg-success/5", icon: "✚", label: "ADD" },
    drop: { border: "border-l-danger", bg: "bg-danger/5", icon: "✗", label: "DROP" },
    promote_to_primary: { border: "border-l-accent", bg: "bg-accent/5", icon: "↑", label: "PROMOTE" },
  }[cat.action];

  const conf = Math.round(cat.confidence * 100);
  const confBars = Math.round(cat.confidence * 10);

  return (
    <div className={`border-l-2 rounded-r p-3 ${styles.border} ${styles.bg}`}>
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-xs font-semibold">
          <span className="text-muted mr-1">{index}.</span> {styles.icon} {cat.name}
          {cat.proposedPrimary && <span className="ml-2 rounded bg-warning/20 px-1.5 py-0.5 text-[9px] text-warning">★ PRIMARY</span>}
          <code className="ml-2 text-[9px] font-normal text-muted">{cat.gcid}</code>
        </h4>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-[9px] text-muted">{styles.label}</span>
          <div className="flex h-1 w-16 overflow-hidden rounded bg-border">
            <div
              className={`h-full ${cat.confidence >= 0.85 ? "bg-success" : cat.confidence >= 0.6 ? "bg-accent" : "bg-warning"}`}
              style={{ width: `${conf}%` }}
            />
          </div>
          <span className="text-[9px] tabular-nums text-muted">{conf}%</span>
        </div>
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-muted">{cat.reasoning}</p>
    </div>
  );
}
