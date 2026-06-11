/**
 * Operator-facing summary of the readiness findings RESOLUTION state for
 * step 7 (brand_findings_resolved) in the provisioning drawer.
 *
 * Step 7 is the TENANT-owned counterpart to step 6 (which is platform-owned).
 * Where step 6's drawer surfaces the consolidator's substantive work
 * (provenance, source PPA, freshness), step 7's drawer surfaces the
 * tenant's substantive work: per-finding resolution decisions.
 *
 * Read-only display of:
 *   - Progress headline: N of M action-requiring findings addressed
 *   - Severity breakdown — open vs addressed per severity (blocking,
 *     refinement; informational is shown for context but doesn't gate
 *     completion)
 *   - Resolution-status breakdown (resolved / waived / deferred)
 *   - Click-out CTA → /ops/brand-identity/readiness-findings (the
 *     finding-by-finding resolution view)
 *
 * Per the drawer doctrine ([[provisioning-drawer-console]]): drawer
 * surfaces the work-state; the full page does the heavy editing work.
 *
 * Per the brand identity readiness audit doctrine
 * ([[observation-driven-readiness-audit]]): completion criterion is
 * "all blocking + refinement findings resolved/waived/deferred";
 * informational findings don't gate.
 */
"use client";

import Link from "next/link";
import { useState, useEffect, useCallback } from "react";

interface Finding {
  id: string;
  severity: "blocking" | "refinement" | "informational";
  attribution: "brand_gap" | "inconsistency" | "external" | "informational";
}

interface FindingsPayload {
  findings: Finding[];
}

interface FindingsApiResponse {
  findings: FindingsPayload | null;
  resolutions: Record<string, { status: "resolved" | "waived" | "deferred" }>;
}

const SEVERITY_LABEL = {
  blocking: "Blocking",
  refinement: "Refinement",
  informational: "Informational",
} as const;

const SEVERITY_DOT: Record<keyof typeof SEVERITY_LABEL, string> = {
  blocking: "bg-red-500",
  refinement: "bg-amber-500",
  informational: "bg-slate-400",
};

const RESOLUTION_LABEL = {
  resolved: "Resolved",
  waived: "Waived",
  deferred: "Deferred",
} as const;

const RESOLUTION_DOT: Record<keyof typeof RESOLUTION_LABEL, string> = {
  resolved: "bg-emerald-500",
  waived: "bg-slate-500",
  deferred: "bg-sky-500",
};

export function ReadinessResolutionSummary({ businessId }: { businessId: string }) {
  const [data, setData] = useState<FindingsApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/ops/brand-identity/findings?siteId=${businessId}`);
      if (!r.ok) throw new Error(`findings API ${r.status}`);
      setData(await r.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loading) {
    return <p className="text-[11px] text-muted italic">Loading resolution progress…</p>;
  }
  if (error) {
    return <p className="text-[11px] text-red-600 dark:text-red-400">{error}</p>;
  }
  if (!data?.findings) {
    return (
      <div className="rounded-md border border-dashed border-border bg-card/40 px-3 py-4 text-center text-[11px] text-muted">
        No findings yet. Step 6 (Readiness findings consolidated) must complete first.
      </div>
    );
  }

  const findings = data.findings.findings;
  const resolutions = data.resolutions ?? {};

  // Counts. Completion-gating set = blocking + refinement (informational is
  // shown for context but doesn't block the step).
  const actionRequiring = findings.filter(
    (f) => f.severity === "blocking" || f.severity === "refinement",
  );
  const addressedActionRequiring = actionRequiring.filter((f) => !!resolutions[f.id]);

  const bySeverity = {
    blocking: { total: 0, open: 0 },
    refinement: { total: 0, open: 0 },
    informational: { total: 0, open: 0 },
  };
  for (const f of findings) {
    bySeverity[f.severity].total++;
    if (!resolutions[f.id]) bySeverity[f.severity].open++;
  }

  const byResolution = { resolved: 0, waived: 0, deferred: 0 };
  for (const r of Object.values(resolutions)) {
    if (r.status === "resolved") byResolution.resolved++;
    else if (r.status === "waived") byResolution.waived++;
    else if (r.status === "deferred") byResolution.deferred++;
  }

  const allAddressed =
    actionRequiring.length > 0 && addressedActionRequiring.length === actionRequiring.length;
  const noActionNeeded = actionRequiring.length === 0;

  const progressPct =
    actionRequiring.length === 0
      ? 100
      : Math.round((addressedActionRequiring.length / actionRequiring.length) * 100);

  return (
    <div className="space-y-4">
      {/* Progress headline */}
      <div className="rounded-md border border-border bg-card/40 px-3 py-3 space-y-2">
        {noActionNeeded ? (
          <p className="text-xs text-emerald-700 dark:text-emerald-300 leading-snug">
            ✓ No action-requiring findings. Step auto-completes.
          </p>
        ) : (
          <>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] text-muted uppercase tracking-wide font-medium">
                Owner progress
              </span>
              <span className="text-xs font-mono text-foreground">
                {addressedActionRequiring.length} of {actionRequiring.length} addressed
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-border/40 overflow-hidden">
              <div
                className={`h-full transition-all ${
                  allAddressed ? "bg-emerald-500" : "bg-amber-500"
                }`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </>
        )}
      </div>

      {/* By severity */}
      <section>
        <h4 className="text-[10px] uppercase tracking-wide text-muted font-medium mb-1.5">
          By severity
        </h4>
        <div className="space-y-1">
          {(["blocking", "refinement", "informational"] as const).map((sev) => {
            const b = bySeverity[sev];
            if (b.total === 0) return null;
            const gating = sev !== "informational";
            return (
              <div
                key={sev}
                className="flex items-center justify-between text-xs px-2 py-1 rounded border border-border bg-card/30"
              >
                <span className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[sev]}`} />
                  {SEVERITY_LABEL[sev]}
                  {!gating && (
                    <span className="text-[9px] text-muted/80 italic">(non-gating)</span>
                  )}
                </span>
                <span className="font-mono text-[11px]">
                  {gating ? (
                    <>
                      <span className={b.open > 0 ? "text-amber-700 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400"}>
                        {b.open} open
                      </span>
                      <span className="text-muted"> / {b.total}</span>
                    </>
                  ) : (
                    <span className="text-muted">{b.total}</span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* By resolution status — only when there are some resolutions */}
      {Object.keys(resolutions).length > 0 && (
        <section>
          <h4 className="text-[10px] uppercase tracking-wide text-muted font-medium mb-1.5">
            By resolution status
          </h4>
          <div className="space-y-1">
            {(["resolved", "waived", "deferred"] as const).map((s) => {
              if (byResolution[s] === 0) return null;
              return (
                <div
                  key={s}
                  className="flex items-center justify-between text-xs px-2 py-1 rounded border border-border bg-card/30"
                >
                  <span className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${RESOLUTION_DOT[s]}`} />
                    {RESOLUTION_LABEL[s]}
                  </span>
                  <span className="font-mono text-[11px]">{byResolution[s]}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Click-out CTA — drawer doctrine: heavy editing surfaces hold a deep-link */}
      <Link
        href={`/ops/brand-identity/readiness-findings?siteId=${businessId}`}
        className={`block w-full rounded border px-3 py-1.5 text-[11px] font-medium text-center transition-colors ${
          allAddressed || noActionNeeded
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-500/20"
            : "border-amber-500/60 bg-amber-500/10 text-amber-800 dark:text-amber-300 hover:bg-amber-500/20"
        }`}
      >
        {allAddressed || noActionNeeded
          ? "→ Open resolution view"
          : `→ Resolve ${actionRequiring.length - addressedActionRequiring.length} open ${
              actionRequiring.length - addressedActionRequiring.length === 1
                ? "finding"
                : "findings"
            }`}
      </Link>
    </div>
  );
}
