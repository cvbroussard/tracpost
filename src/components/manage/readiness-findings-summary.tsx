/**
 * Operator-facing summary of the readiness findings consolidation for
 * step 6 (brand_readiness_findings) in the provisioning drawer.
 *
 * Read-only display of:
 *   - Consolidation provenance (when, model + prompt_version, source PPA)
 *   - Findings breakdown by severity + attribution
 *   - Stale-PPA check (latest PPA run vs the run that findings consumed)
 *   - Owner progress hint (resolved / total)
 *
 * Per the readiness findings consolidator architecture
 * ([[observation-driven-readiness-audit]]) + the recurring quality gate
 * doctrine: findings are append-pattern; resolutions carry forward via
 * deterministic UUIDs. Surfacing both provenance and freshness here
 * makes the consolidator's substantive work visible to operators.
 *
 * Re-uses the existing /api/ops/brand-identity/findings + observation
 * endpoints rather than building a dedicated summary endpoint. The
 * findings payload for a typical brand is ~10-50 KB, small enough to
 * compute summary counts client-side without a separate fetch.
 */
"use client";

import { useState, useEffect, useCallback } from "react";

interface Finding {
  id: string;
  severity: "blocking" | "refinement" | "informational";
  attribution: "brand_gap" | "inconsistency" | "external" | "informational";
  descriptor_key: string | null;
}

interface FindingsPayload {
  findings: Finding[];
  meta: {
    source_substrate_id: string;
    source_substrate_kind: string;
    generated_at: string;
    model_for_prompt_text: string;
    prompt_version: string;
    counts: Record<string, number>;
  };
}

interface FindingsApiResponse {
  findings: FindingsPayload | null;
  findingsSubstrateId: string | null;
  updatedAt: string | null;
  resolutions: Record<string, { status: string }>;
  latestRunNumber: number | null;
}

interface ObservationRun {
  id: string;
  runNumber: number;
  payload: { meta?: { verdict?: string } };
  generationMetadata: {
    model: string;
    prompt_version: string;
    generated_at: string;
  } | null;
}

interface ObservationApiResponse {
  runs: ObservationRun[];
}

const SEVERITY_LABEL = {
  blocking: "Blocking",
  refinement: "Refinement",
  informational: "Informational",
} as const;

const ATTRIBUTION_LABEL = {
  brand_gap: "Brand gap",
  inconsistency: "Inconsistency",
  external: "External",
  informational: "Informational",
} as const;

const SEVERITY_DOT: Record<keyof typeof SEVERITY_LABEL, string> = {
  blocking: "bg-red-500",
  refinement: "bg-amber-500",
  informational: "bg-slate-400",
};

const ATTRIBUTION_ICON: Record<keyof typeof ATTRIBUTION_LABEL, string> = {
  brand_gap: "⚠",
  inconsistency: "↻",
  external: "→",
  informational: "·",
};

export function ReadinessFindingsSummary({
  businessId,
  onRerun,
}: {
  businessId: string;
  /** Optional callback after a successful re-run trigger — provisioning
   *  drawer uses this to refresh task statuses. */
  onRerun?: () => void;
}) {
  const [findingsData, setFindingsData] = useState<FindingsApiResponse | null>(null);
  const [observationData, setObservationData] = useState<ObservationApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rerunning, setRerunning] = useState(false);
  const [rerunError, setRerunError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [findingsRes, observationRes] = await Promise.all([
        fetch(`/api/ops/brand-identity/findings?siteId=${businessId}`),
        fetch(`/api/ops/brand-identity/observation?siteId=${businessId}`),
      ]);
      if (!findingsRes.ok) throw new Error(`findings API ${findingsRes.status}`);
      if (!observationRes.ok) throw new Error(`observation API ${observationRes.status}`);
      setFindingsData(await findingsRes.json());
      setObservationData(await observationRes.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const rerunConsolidation = useCallback(async () => {
    setRerunning(true);
    setRerunError(null);
    try {
      const r = await fetch("/api/ops/brand-identity/findings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId: businessId }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data?.persisted) {
        throw new Error(data?.reason || `HTTP ${r.status}`);
      }
      await refresh();
      onRerun?.();
    } catch (e) {
      setRerunError(e instanceof Error ? e.message : String(e));
    } finally {
      setRerunning(false);
    }
  }, [businessId, refresh, onRerun]);

  if (loading) {
    return <p className="text-[11px] text-muted italic">Loading findings summary…</p>;
  }
  if (error) {
    return <p className="text-[11px] text-red-600 dark:text-red-400">{error}</p>;
  }
  if (!findingsData?.findings) {
    return (
      <div className="rounded-md border border-dashed border-border bg-card/40 px-3 py-4 text-center text-[11px] text-muted">
        No consolidation yet. Click <strong>Re-run consolidation</strong> after PPA + CMA have completed.
      </div>
    );
  }

  const findings = findingsData.findings.findings;
  const meta = findingsData.findings.meta;

  // Counts
  const counts = {
    total: findings.length,
    bySeverity: { blocking: 0, refinement: 0, informational: 0 },
    byAttribution: { brand_gap: 0, inconsistency: 0, external: 0, informational: 0 },
  };
  for (const f of findings) {
    counts.bySeverity[f.severity]++;
    counts.byAttribution[f.attribution]++;
  }

  // Resolution progress
  const resolved = Object.values(findingsData.resolutions).filter(
    (r) => r.status === "resolved" || r.status === "waived" || r.status === "deferred",
  ).length;

  // Stale check: compare findings.meta.source_substrate_id to latest PPA run id.
  const latestPpaRun = observationData?.runs?.[0];
  const latestPpaSubstrateId = latestPpaRun?.id ?? null;
  const findingsSource = meta.source_substrate_id;
  const stale = !!(latestPpaSubstrateId && findingsSource && latestPpaSubstrateId !== findingsSource);
  const sourcePpaRun = observationData?.runs?.find((r) => r.id === findingsSource);

  return (
    <div className="space-y-4">
      {/* Provenance header */}
      <div className="rounded-md border border-border bg-card/40 px-3 py-2 space-y-1 text-[11px]">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-muted">Source PPA</span>
          <span className="text-foreground font-mono">
            {sourcePpaRun
              ? `Run #${sourcePpaRun.runNumber} · ${new Date(sourcePpaRun.generationMetadata?.generated_at ?? "").toLocaleString()}`
              : "(unknown)"}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-muted">Consolidated</span>
          <span className="text-foreground font-mono">
            {new Date(meta.generated_at).toLocaleString()}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-muted">Generator</span>
          <span className="text-foreground font-mono">
            {meta.model_for_prompt_text} · {meta.prompt_version}
          </span>
        </div>
      </div>

      {/* Stale callout */}
      {stale && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300">
          <p className="font-medium mb-0.5">⚠ Consolidation is stale</p>
          <p className="text-amber-800/80 dark:text-amber-300/80 leading-relaxed">
            PPA has re-run since this consolidation. Current findings consumed Run #
            {sourcePpaRun?.runNumber ?? "?"}; latest PPA is Run #{latestPpaRun?.runNumber}.
            Consider re-running consolidation against the latest observation.
          </p>
        </div>
      )}

      {/* By severity */}
      <section>
        <h4 className="text-[10px] uppercase tracking-wide text-muted font-medium mb-1.5">
          By severity ({counts.total} total)
        </h4>
        <div className="space-y-1">
          {(["blocking", "refinement", "informational"] as const).map((sev) => (
            <div
              key={sev}
              className="flex items-center justify-between text-xs px-2 py-1 rounded border border-border bg-card/30"
            >
              <span className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[sev]}`} />
                {SEVERITY_LABEL[sev]}
              </span>
              <span className="font-mono">{counts.bySeverity[sev]}</span>
            </div>
          ))}
        </div>
      </section>

      {/* By attribution */}
      <section>
        <h4 className="text-[10px] uppercase tracking-wide text-muted font-medium mb-1.5">
          By attribution
        </h4>
        <div className="space-y-1">
          {(["brand_gap", "inconsistency", "external", "informational"] as const).map((attr) => (
            <div
              key={attr}
              className="flex items-center justify-between text-xs px-2 py-1 rounded border border-border bg-card/30"
            >
              <span className="flex items-center gap-2">
                <span className="text-muted w-3 inline-block text-center">{ATTRIBUTION_ICON[attr]}</span>
                {ATTRIBUTION_LABEL[attr]}
              </span>
              <span className="font-mono">{counts.byAttribution[attr]}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Owner progress hint */}
      {counts.total > 0 && (
        <div className="text-[10px] text-muted italic">
          Owner progress: {resolved} of {counts.total} resolved · {counts.total - resolved} open
        </div>
      )}

      {/* Re-run action */}
      <button
        type="button"
        onClick={rerunConsolidation}
        disabled={rerunning}
        className={`w-full rounded border px-3 py-1.5 text-[11px] font-medium transition-colors ${
          stale
            ? "border-amber-500/60 bg-amber-500/10 text-amber-800 dark:text-amber-300 hover:bg-amber-500/20"
            : "border-accent/40 bg-accent/10 text-foreground hover:bg-accent/20"
        } disabled:opacity-50`}
      >
        {rerunning ? "Re-running…" : stale ? "↻ Re-run consolidation (recommended)" : "↻ Re-run consolidation"}
      </button>
      {rerunError && (
        <p className="text-[10px] text-red-600 dark:text-red-400">{rerunError}</p>
      )}
    </div>
  );
}
