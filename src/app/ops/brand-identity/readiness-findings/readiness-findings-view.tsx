"use client";
import { useCallback, useEffect, useState } from "react";
import { BucketTabs } from "../page";
import type {
  ReadinessFinding,
  ReadinessFindingsPayload,
  FindingAttribution,
  FindingSeverity,
} from "@/lib/brand-identity/readiness-findings-types";

interface ObservationProbe {
  observation: { id: string; updatedAt: string } | null;
}

interface FindingsApiResponse {
  findings: ReadinessFindingsPayload | null;
  updatedAt: string | null;
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

export function ReadinessFindingsView({ siteId }: { siteId: string }) {
  // Remount-keyed by siteId so internal state resets cleanly across site
  // switches; matches the ObservationView pattern.
  return <ReadinessFindingsFetcher key={siteId} siteId={siteId} />;
}

function ReadinessFindingsFetcher({ siteId }: { siteId: string }) {
  const [findings, setFindings] = useState<ReadinessFindingsPayload | null>(null);
  const [findingsUpdatedAt, setFindingsUpdatedAt] = useState<string | null>(null);
  const [observationId, setObservationId] = useState<string | null>(null);
  const [observationUpdatedAt, setObservationUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setFindingsUpdatedAt(findingsJson.updatedAt);
      setObservationId(observationJson.observation?.id ?? null);
      setObservationUpdatedAt(observationJson.observation?.updatedAt ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [siteId]);

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
            onGenerate={generate}
          />

          {loading && !findings && <p className="text-xs text-muted">Loading findings…</p>}

          {!loading && !findings && <NoFindingsYetEmpty />}

          {findings && <FindingsCountSummary counts={findings.meta.counts} />}

          {findings && (
            <div className="space-y-6">
              {SEVERITY_ORDER.map((sev) => (
                <SeverityGroup
                  key={sev}
                  severity={sev}
                  findings={findings.findings.filter((f) => f.severity === sev)}
                />
              ))}
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
      <BucketTabs bucket="readiness-findings" />
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
  onGenerate,
}: {
  findings: ReadinessFindingsPayload | null;
  generating: boolean;
  stale: boolean;
  onGenerate: () => void;
}) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <button
        type="button"
        onClick={onGenerate}
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

function FindingsCountSummary({
  counts,
}: {
  counts: ReadinessFindingsPayload["meta"]["counts"];
}) {
  return (
    <div className="flex flex-wrap gap-3 text-[11px]">
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
  );
}

function SeverityGroup({
  severity,
  findings,
}: {
  severity: FindingSeverity;
  findings: ReadinessFinding[];
}) {
  if (findings.length === 0) return null;
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-medium border-b border-border pb-1">
        {SEVERITY_LABEL[severity]} <span className="text-muted">({findings.length})</span>
      </h3>
      <div className="space-y-3">
        {findings.map((f) => (
          <FindingCard key={f.id} finding={f} />
        ))}
      </div>
    </div>
  );
}

function FindingCard({ finding }: { finding: ReadinessFinding }) {
  return (
    <div className="rounded border border-border bg-card p-3 space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <span
          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${SEVERITY_COLORS[finding.severity]}`}
        >
          {SEVERITY_LABEL[finding.severity]}
        </span>
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
