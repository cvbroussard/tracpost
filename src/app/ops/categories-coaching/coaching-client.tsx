"use client";

import { useState, useEffect, useCallback } from "react";

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

interface Site {
  id: string;
  name: string;
}

export function CategoriesCoachingClient({ subscriberId }: { subscriberId: string }) {
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string>("");
  const [run, setRun] = useState<CoachingRun | null>(null);
  const [loading, setLoading] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appliedNotice, setAppliedNotice] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/admin/sites?subscription_id=${subscriberId}`)
      .then((r) => (r.ok ? r.json() : { sites: [] }))
      .then((d: { sites: Site[] }) => {
        setSites(d.sites || []);
        if (d.sites?.length > 0) setSelectedSiteId(d.sites[0].id);
      });
  }, [subscriberId]);

  const loadRun = useCallback(async () => {
    if (!selectedSiteId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/category-coaching/${selectedSiteId}`);
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      const d = await res.json();
      setRun(d.run);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [selectedSiteId]);

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
    if (!selectedSiteId) return;
    setTriggering(true);
    setAppliedNotice(null);
    try {
      const res = await fetch(`/api/admin/category-coaching/${selectedSiteId}/run`, { method: "POST" });
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
    if (!selectedSiteId || !run) return;
    if (!confirm("Apply this plan to the site's GBP categories?\n\nThis replaces site_gbp_categories with the 10-best plan and marks gbp_sync_dirty=true. The push to Google fires on the next sync cycle.")) return;
    setApplying(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/category-coaching/${selectedSiteId}/apply`, {
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

  if (!subscriberId) {
    return <div className="p-4 text-xs text-muted">Select a subscriber to view categories coaching.</div>;
  }

  return (
    <div className="space-y-4 p-4">
      {/* Trigger panel */}
      <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <label className="text-[10px] text-muted">Site</label>
            <select
              value={selectedSiteId}
              onChange={(e) => setSelectedSiteId(e.target.value)}
              className="mt-1 w-full max-w-md rounded border border-border bg-background px-3 py-1.5 text-xs focus:border-accent focus:outline-none"
            >
              {sites.length === 0 && <option>No sites</option>}
              {sites.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
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
              disabled={triggering || !selectedSiteId || run?.status === "running"}
              className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {triggering ? "Triggering…" : run ? "Run new coaching" : "Run coaching"}
            </button>
          </div>
        </div>
        <p className="mt-2 text-[10px] text-muted">
          Auto-triggers a CMA if none exists (β rule). Full pipeline ~60-120s, ~$0.21/run.
        </p>
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
          <p className="text-xs text-muted">No coaching has run for this site yet.</p>
          <p className="mt-1 text-[10px] text-muted">Click "Run coaching" to generate the 10-best GBP categories plan.</p>
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

      {/* The 10-best plan */}
      <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
        <h3 className="mb-3 text-sm font-medium">10-Best Category Plan</h3>
        <div className="space-y-2">
          {data.categories.map((c, i) => (
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
