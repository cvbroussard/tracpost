"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DomainTabs } from "../page";
import type {
  ReadinessFinding,
  ReadinessFindingsPayload,
  FindingAttribution,
  FindingSeverity,
} from "@/lib/brand-identity/readiness-findings-types";

type ResolutionStatus = "resolved" | "waived" | "deferred";

interface FindingResolutionDTO {
  status: ResolutionStatus;
  response: string | null;
  resolvedAt: string;
  updatedAt: string;
  findingsSubstrateId: string;
}

interface ObservationProbe {
  observation: { id: string; updatedAt: string } | null;
}

/** Per-finding lifecycle from server. Mirrors lib/FindingLifecycle but
 *  uses Record-keyed shape from the API. See [[ppa-cma-recurring-quality-gate]]. */
interface FindingLifecycleDTO {
  findingId: string;
  appearedInRuns: number[];
  firstSeenInRun: number;
  lastSeenInRun: number;
  clearedInLatestRun: boolean;
  regressed: boolean;
  resolution: FindingResolutionDTO | null;
  resolvedButReappeared: boolean;
}

interface FindingsApiResponse {
  findings: ReadinessFindingsPayload | null;
  findingsSubstrateId: string | null;
  updatedAt: string | null;
  resolutions: Record<string, FindingResolutionDTO>;
  lifecycle: Record<string, FindingLifecycleDTO>;
  latestRunNumber: number | null;
}

const SEVERITY_ORDER: FindingSeverity[] = ["blocking", "refinement", "informational"];

const SEVERITY_LABEL: Record<FindingSeverity, string> = {
  blocking: "Blocking",
  refinement: "Refinement",
  informational: "Informational",
};

const SEVERITY_COLORS: Record<FindingSeverity, string> = {
  blocking: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300",
  refinement: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  informational: "border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-300",
};

const ATTRIBUTION_LABEL: Record<FindingAttribution, string> = {
  external: "External — owner-controlled surface",
  inconsistency: "Inconsistency — mismatched surfaces",
  brand_gap: "Brand gap — signal absent",
};

const RESOLUTION_LABEL: Record<ResolutionStatus, string> = {
  resolved: "Resolved",
  waived: "Waived",
  deferred: "Deferred",
};

const RESOLUTION_COLORS: Record<ResolutionStatus, string> = {
  resolved: "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  waived: "border-slate-500/40 bg-slate-500/15 text-slate-700 dark:text-slate-300",
  deferred: "border-sky-500/40 bg-sky-500/15 text-sky-700 dark:text-sky-300",
};

export function ReadinessFindingsView({ siteId }: { siteId: string }) {
  // Remount-keyed by siteId so internal state resets cleanly across site
  // switches; matches the ObservationView pattern.
  return <ReadinessFindingsFetcher key={siteId} siteId={siteId} />;
}

function ReadinessFindingsFetcher({ siteId }: { siteId: string }) {
  const [findings, setFindings] = useState<ReadinessFindingsPayload | null>(null);
  const [findingsSubstrateId, setFindingsSubstrateId] = useState<string | null>(null);
  const [findingsUpdatedAt, setFindingsUpdatedAt] = useState<string | null>(null);
  const [resolutions, setResolutions] = useState<Record<string, FindingResolutionDTO>>({});
  const [lifecycle, setLifecycle] = useState<Record<string, FindingLifecycleDTO>>({});
  const [latestRunNumber, setLatestRunNumber] = useState<number | null>(null);
  const [observationId, setObservationId] = useState<string | null>(null);
  const [observationUpdatedAt, setObservationUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showOpenOnly, setShowOpenOnly] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [findingsRes, observationRes] = await Promise.all([
        fetch(`/api/ops/brand-identity/findings?siteId=${siteId}`),
        fetch(`/api/ops/brand-identity/observation?siteId=${siteId}`),
      ]);
      if (!findingsRes.ok) throw new Error(`findings API ${findingsRes.status}`);
      if (!observationRes.ok) throw new Error(`observation API ${observationRes.status}`);
      const findingsJson = (await findingsRes.json()) as FindingsApiResponse;
      const observationJson = (await observationRes.json()) as ObservationProbe;
      setFindings(findingsJson.findings);
      setFindingsSubstrateId(findingsJson.findingsSubstrateId);
      setFindingsUpdatedAt(findingsJson.updatedAt);
      setResolutions(findingsJson.resolutions ?? {});
      setLifecycle(findingsJson.lifecycle ?? {});
      setLatestRunNumber(findingsJson.latestRunNumber ?? null);
      setObservationId(observationJson.observation?.id ?? null);
      setObservationUpdatedAt(observationJson.observation?.updatedAt ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  // Optimistic update for one finding's resolution; saves a refresh round-trip.
  const recordResolution = useCallback(
    (findingId: string, resolution: FindingResolutionDTO | null) => {
      setResolutions((prev) => {
        const next = { ...prev };
        if (resolution === null) delete next[findingId];
        else next[findingId] = resolution;
        return next;
      });
    },
    [],
  );

  const resolutionCounts = useMemo(() => {
    const c = { resolved: 0, waived: 0, deferred: 0, open: 0 };
    if (!findings) return c;
    for (const f of findings.findings) {
      const r = resolutions[f.id];
      if (!r) c.open++;
      else c[r.status]++;
    }
    return c;
  }, [findings, resolutions]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const generate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const r = await fetch(`/api/ops/brand-identity/findings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId }),
      });
      const json = (await r.json()) as { persisted: boolean; reason?: string };
      if (!r.ok || !json.persisted) {
        setError(json.reason || `API ${r.status}`);
        setGenerating(false);
        return;
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  };

  const stale =
    findings !== null &&
    observationId !== null &&
    findings.meta.source_substrate_id !== observationId;
  const observationMissing = observationId === null;
  const hasAnyResolutions = Object.keys(resolutions).length > 0;

  return (
    <Shell>
      <Header
        observationUpdatedAt={observationUpdatedAt}
        findingsUpdatedAt={findingsUpdatedAt}
      />

      {error && <p className="text-xs text-red-600">{error}</p>}

      {observationMissing ? (
        <ObservationMissingEmpty />
      ) : (
        <>
          <GenerateControls
            findings={findings}
            generating={generating}
            stale={stale}
            hasAnyResolutions={hasAnyResolutions}
            onGenerate={generate}
          />

          {loading && !findings && <p className="text-xs text-muted">Loading findings…</p>}

          {!loading && !findings && <NoFindingsYetEmpty />}

          {findings && (
            <FindingsTopSummary
              counts={findings.meta.counts}
              resolutionCounts={resolutionCounts}
              showOpenOnly={showOpenOnly}
              onToggleOpenOnly={() => setShowOpenOnly((v) => !v)}
            />
          )}

          {findings && findingsSubstrateId && (
            <div className="space-y-6">
              {SEVERITY_ORDER.map((sev) => {
                const filtered = findings.findings
                  .filter((f) => f.severity === sev)
                  .filter((f) => !showOpenOnly || !resolutions[f.id]);
                return (
                  <SeverityGroup
                    key={sev}
                    severity={sev}
                    findings={filtered}
                    resolutions={resolutions}
                    lifecycle={lifecycle}
                    latestRunNumber={latestRunNumber}
                    siteId={siteId}
                    findingsSubstrateId={findingsSubstrateId}
                    onResolved={recordResolution}
                  />
                );
              })}
            </div>
          )}
        </>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-4 space-y-5 pb-12 max-w-5xl">
      <DomainTabs domain="readiness-findings" />
      {children}
    </div>
  );
}

function Header({
  observationUpdatedAt,
  findingsUpdatedAt,
}: {
  observationUpdatedAt: string | null;
  findingsUpdatedAt: string | null;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-3 flex-wrap">
        <h1 className="text-xl font-semibold">Brand Identity — Readiness Findings</h1>
        {findingsUpdatedAt && (
          <span className="text-xs text-muted">
            findings generated {new Date(findingsUpdatedAt).toLocaleString()}
          </span>
        )}
      </div>
      <p className="text-xs text-muted leading-relaxed">
        Each observation becomes a finding here, framed as an agency would in the first kickoff:
        &ldquo;explain this&rdquo; questions for owner-controlled surfaces, reconciliation
        prompts for cross-surface inconsistencies, consultative proposals where signal is
        absent. v1 is public-presence only; the intake bundle (CMA + Public Presence) is the
        locked target.
      </p>
      {observationUpdatedAt && (
        <p className="text-[10px] text-muted">
          Source observation last updated {new Date(observationUpdatedAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}

function GenerateControls({
  findings,
  generating,
  stale,
  hasAnyResolutions,
  onGenerate,
}: {
  findings: ReadinessFindingsPayload | null;
  generating: boolean;
  stale: boolean;
  hasAnyResolutions: boolean;
  onGenerate: () => void;
}) {
  const handleClick = () => {
    // Per [[ppa-cma-recurring-quality-gate]] step 2: finding IDs are now
    // deterministic UUIDs (uuidv5(descriptor_key + canonical observation,
    // brand_uuid)). Regenerating preserves the same UUIDs for the same
    // content, so resolutions auto-carry-forward to matching findings in
    // the new run. The old "orphans resolutions" warning was based on
    // random UUIDs and is no longer accurate.
    if (
      findings &&
      hasAnyResolutions &&
      !window.confirm(
        "Regenerate findings? This creates a new run. Resolutions you've already set will carry forward " +
          "automatically when the same finding re-appears (deterministic IDs). New findings that appear in " +
          "this run will be unresolved. Continue?",
      )
    ) {
      return;
    }
    onGenerate();
  };
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <button
        type="button"
        onClick={handleClick}
        disabled={generating}
        className="rounded border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent/20 disabled:opacity-50"
      >
        {generating
          ? "Generating findings… (may take up to 90s)"
          : findings
          ? "Regenerate findings"
          : "Generate findings"}
      </button>
      {stale && (
        <span className="text-[10px] text-amber-700 dark:text-amber-300">
          ⚠ Observation has been refreshed since these findings were generated — regenerate to sync
        </span>
      )}
    </div>
  );
}

function ObservationMissingEmpty() {
  return (
    <div className="rounded border border-border bg-card p-4">
      <p className="text-xs text-muted leading-relaxed">
        No public presence observation has been generated for this site yet. Generate the
        observation first from the{" "}
        <a href="/ops/brand-identity/observation" className="underline">
          Public Presence
        </a>{" "}
        tab — readiness findings consolidate FROM the observation, so the observation has to
        exist first.
      </p>
    </div>
  );
}

function NoFindingsYetEmpty() {
  return (
    <p className="text-xs text-muted italic">
      No findings have been generated yet. Click <em>Generate findings</em> above to
      consolidate the public presence observation into the agency-conversation deliverable.
    </p>
  );
}

function FindingsTopSummary({
  counts,
  resolutionCounts,
  showOpenOnly,
  onToggleOpenOnly,
}: {
  counts: ReadinessFindingsPayload["meta"]["counts"];
  resolutionCounts: { resolved: number; waived: number; deferred: number; open: number };
  showOpenOnly: boolean;
  onToggleOpenOnly: () => void;
}) {
  return (
    <div className="space-y-2 border-b border-border pb-3">
      <div className="flex flex-wrap items-center gap-3 text-[11px]">
        <span className="text-muted">
          Total: <span className="font-medium text-foreground">{counts.total}</span>
        </span>
        {SEVERITY_ORDER.map((sev) =>
          counts.by_severity[sev] > 0 ? (
            <span key={sev} className={`rounded-full border px-2 py-0.5 ${SEVERITY_COLORS[sev]}`}>
              {SEVERITY_LABEL[sev]}: {counts.by_severity[sev]}
            </span>
          ) : null,
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-[11px]">
        <span className="text-muted">
          Progress:{" "}
          <span className="font-medium text-foreground">
            {counts.total - resolutionCounts.open} of {counts.total} addressed
          </span>
        </span>
        {(["resolved", "waived", "deferred"] as const).map((s) =>
          resolutionCounts[s] > 0 ? (
            <span key={s} className={`rounded-full border px-2 py-0.5 ${RESOLUTION_COLORS[s]}`}>
              {RESOLUTION_LABEL[s]}: {resolutionCounts[s]}
            </span>
          ) : null,
        )}
        <span className="ml-auto">
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={showOpenOnly}
              onChange={onToggleOpenOnly}
              className="rounded"
            />
            <span className="text-muted">Show open only</span>
          </label>
        </span>
      </div>
    </div>
  );
}

interface ResolutionHandler {
  (findingId: string, resolution: FindingResolutionDTO | null): void;
}

function SeverityGroup({
  severity,
  findings,
  resolutions,
  lifecycle,
  latestRunNumber,
  siteId,
  findingsSubstrateId,
  onResolved,
}: {
  severity: FindingSeverity;
  findings: ReadinessFinding[];
  resolutions: Record<string, FindingResolutionDTO>;
  lifecycle: Record<string, FindingLifecycleDTO>;
  latestRunNumber: number | null;
  siteId: string;
  findingsSubstrateId: string;
  onResolved: ResolutionHandler;
}) {
  if (findings.length === 0) return null;
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-medium border-b border-border pb-1">
        {SEVERITY_LABEL[severity]} <span className="text-muted">({findings.length})</span>
      </h3>
      <div className="space-y-3">
        {findings.map((f) => (
          <FindingCard
            key={f.id}
            finding={f}
            resolution={resolutions[f.id] ?? null}
            lifecycle={lifecycle[f.id] ?? null}
            latestRunNumber={latestRunNumber}
            siteId={siteId}
            findingsSubstrateId={findingsSubstrateId}
            onResolved={onResolved}
          />
        ))}
      </div>
    </div>
  );
}

function FindingCard({
  finding,
  resolution,
  lifecycle,
  latestRunNumber,
  siteId,
  findingsSubstrateId,
  onResolved,
}: {
  finding: ReadinessFinding;
  resolution: FindingResolutionDTO | null;
  lifecycle: FindingLifecycleDTO | null;
  latestRunNumber: number | null;
  siteId: string;
  findingsSubstrateId: string;
  onResolved: ResolutionHandler;
}) {
  const isResolved = resolution !== null;
  const cardOpacity = isResolved ? "opacity-75" : "";
  // Lifecycle signals — surfaced per [[ppa-cma-recurring-quality-gate]]:
  // 1. Carried forward (resolution from a prior run still applies in current)
  // 2. Persisted across runs (finding appeared in multiple consecutive runs)
  // 3. Regressed (finding cleared in some run, then came back)
  // 4. Resolved-but-reappeared (operator marked resolved, diagnostic still surfaces it — highest-priority alert)
  const showCarriedForward =
    !!lifecycle &&
    !!resolution &&
    lifecycle.appearedInRuns.length > 1 &&
    !lifecycle.resolvedButReappeared;
  const showPersisted =
    !!lifecycle &&
    lifecycle.appearedInRuns.length > 1 &&
    !resolution &&
    !lifecycle.regressed;
  const showRegressed = !!lifecycle?.regressed;
  const showResolvedReappeared = !!lifecycle?.resolvedButReappeared;
  const runBadgeText = lifecycle
    ? lifecycle.appearedInRuns.length === 1
      ? `Run ${lifecycle.firstSeenInRun}`
      : `Runs ${lifecycle.firstSeenInRun}–${lifecycle.lastSeenInRun}`
    : null;
  return (
    <div className={`rounded border border-border bg-card p-3 space-y-2 transition-opacity ${cardOpacity}`}>
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${SEVERITY_COLORS[finding.severity]}`}
          >
            {SEVERITY_LABEL[finding.severity]}
          </span>
          {resolution && (
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${RESOLUTION_COLORS[resolution.status]}`}
              title={`Set ${new Date(resolution.resolvedAt).toLocaleString()}`}
            >
              ✓ {RESOLUTION_LABEL[resolution.status]}
            </span>
          )}
          {showResolvedReappeared && (
            <span
              className="inline-flex items-center rounded-full border border-red-500/60 bg-red-500/15 px-2 py-0.5 text-[10px] font-medium text-red-700 dark:text-red-300"
              title="Operator marked resolved, but diagnostic re-surfaces this finding"
            >
              ⚠ Resolved but reappeared
            </span>
          )}
          {showRegressed && !showResolvedReappeared && (
            <span
              className="inline-flex items-center rounded-full border border-amber-500/50 bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300"
              title={`Cleared at some point, then reappeared (appearances: runs ${lifecycle?.appearedInRuns.join(", ")})`}
            >
              ↻ Regressed
            </span>
          )}
          {showCarriedForward && (
            <span
              className="inline-flex items-center rounded-full border border-green-500/40 bg-green-500/10 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:text-green-300"
              title="Resolution from prior run still applies"
            >
              ✓ Carried forward
            </span>
          )}
          {showPersisted && (
            <span
              className="inline-flex items-center rounded-full border border-slate-500/40 bg-slate-500/10 px-2 py-0.5 text-[10px] font-medium text-slate-700 dark:text-slate-300"
              title={`Still surfacing across ${lifecycle?.appearedInRuns.length} consecutive runs`}
            >
              ⊙ Persistent
            </span>
          )}
          {runBadgeText && (
            <span className="text-[10px] text-muted/70 font-mono" title={`Substrate runs: ${lifecycle?.appearedInRuns.join(", ")} · latest overall: ${latestRunNumber ?? "?"}`}>
              {runBadgeText}
            </span>
          )}
        </div>
        <span className="text-[10px] text-muted text-right">
          {ATTRIBUTION_LABEL[finding.attribution]}
          {finding.descriptor_key && (
            <>
              {" · "}
              <span className="font-mono">{finding.descriptor_key}</span>
            </>
          )}
        </span>
      </div>
      <p className="text-sm leading-relaxed text-foreground">{finding.prompt_text}</p>

      <ResolutionControl
        finding={finding}
        resolution={resolution}
        siteId={siteId}
        findingsSubstrateId={findingsSubstrateId}
        onResolved={onResolved}
      />

      <details className="text-[11px]">
        <summary className="cursor-pointer text-muted hover:text-foreground">Observed</summary>
        <p className="mt-1.5 text-foreground leading-relaxed">{finding.observation}</p>
        {finding.evidence.length > 0 && (
          <ul className="mt-1.5 space-y-0.5 pl-3">
            {finding.evidence.map((e, i) => (
              <li key={i} className="text-muted">
                <span className="text-muted/60">·</span> {e}
              </li>
            ))}
          </ul>
        )}
      </details>
    </div>
  );
}

function ResolutionControl({
  finding,
  resolution,
  siteId,
  findingsSubstrateId,
  onResolved,
}: {
  finding: ReadinessFinding;
  resolution: FindingResolutionDTO | null;
  siteId: string;
  findingsSubstrateId: string;
  onResolved: ResolutionHandler;
}) {
  const [response, setResponse] = useState(resolution?.response ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (status: ResolutionStatus) => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/ops/brand-identity/findings/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId,
          findingsSubstrateId,
          findingId: finding.id,
          status,
          response: response.trim() || null,
        }),
      });
      const json = (await res.json()) as { resolved: boolean; error?: string };
      if (!res.ok || !json.resolved) {
        setError(json.error || `API ${res.status}`);
        setSubmitting(false);
        return;
      }
      const now = new Date().toISOString();
      onResolved(finding.id, {
        status,
        response: response.trim() || null,
        resolvedAt: resolution?.status !== status ? now : resolution.resolvedAt,
        updatedAt: now,
        findingsSubstrateId,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const reopen = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/ops/brand-identity/findings/resolve`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, findingId: finding.id }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setError(json.error || `API ${res.status}`);
        setSubmitting(false);
        return;
      }
      onResolved(finding.id, null);
      setResponse("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-1.5 pt-1">
      <textarea
        value={response}
        onChange={(e) => setResponse(e.target.value)}
        placeholder="Owner response (optional) — what was behind that choice, or what you'd want to do about it"
        rows={2}
        className="w-full rounded border border-border bg-background px-2 py-1.5 text-[11px] text-foreground placeholder:text-muted/70 focus:outline-none focus:ring-1 focus:ring-accent/40"
      />
      <div className="flex items-center gap-1.5 flex-wrap">
        {resolution ? (
          <button
            type="button"
            onClick={reopen}
            disabled={submitting}
            className="rounded border border-border px-2 py-0.5 text-[10px] font-medium text-muted hover:text-foreground hover:bg-muted/20 disabled:opacity-50"
          >
            Reopen
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => submit("resolved")}
          disabled={submitting}
          className={`rounded border px-2 py-0.5 text-[10px] font-medium disabled:opacity-50 ${
            resolution?.status === "resolved"
              ? "border-emerald-500/60 bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
              : "border-emerald-500/40 bg-emerald-500/10 text-foreground hover:bg-emerald-500/20"
          }`}
        >
          Mark resolved
        </button>
        <button
          type="button"
          onClick={() => submit("waived")}
          disabled={submitting}
          className={`rounded border px-2 py-0.5 text-[10px] font-medium disabled:opacity-50 ${
            resolution?.status === "waived"
              ? "border-slate-500/60 bg-slate-500/20 text-slate-700 dark:text-slate-300"
              : "border-slate-500/40 bg-slate-500/10 text-foreground hover:bg-slate-500/20"
          }`}
        >
          Waive
        </button>
        <button
          type="button"
          onClick={() => submit("deferred")}
          disabled={submitting}
          className={`rounded border px-2 py-0.5 text-[10px] font-medium disabled:opacity-50 ${
            resolution?.status === "deferred"
              ? "border-sky-500/60 bg-sky-500/20 text-sky-700 dark:text-sky-300"
              : "border-sky-500/40 bg-sky-500/10 text-foreground hover:bg-sky-500/20"
          }`}
        >
          Defer
        </button>
        {submitting && <span className="text-[10px] text-muted">Saving…</span>}
        {error && <span className="text-[10px] text-red-600">{error}</span>}
      </div>
    </div>
  );
}
