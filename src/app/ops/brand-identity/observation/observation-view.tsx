"use client";
import { useCallback, useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceDot,
} from "recharts";
import { DomainTabs } from "../page";
import type {
  BrandIdentityObservationPayload,
  BrandClassVerdict,
  DescriptorObservation,
} from "@/lib/brand-identity/aesthetic-observation-types";

interface ApprovalStatus {
  source: "owner_typed" | "observation_approved" | null;
  approvedAt?: string | null;
  observationSubstrateId?: string | null;
  hasDeclared: boolean;
}

interface ObservationRun {
  id: string;
  runNumber: number;
  payload: BrandIdentityObservationPayload;
  generationMetadata: {
    model: string;
    prompt_version: string;
    generated_at: string;
    confidence?: number | null;
    inputs?: Record<string, unknown>;
  } | null;
  createdAt: string;
  updatedAt: string;
}

interface ObservationApiResponse {
  /** All PPA runs for this brand, newest first. Per
   *  [[ppa-cma-recurring-quality-gate]] — PPA is a recurring measurement
   *  pass and the run history IS the deliverable. */
  runs: ObservationRun[];
  /** Latest run mirrored at the legacy field for backward compat. */
  observation: ObservationRun | null;
  approvals: Record<string, ApprovalStatus>;
}

const VERDICT_LABEL: Record<BrandClassVerdict, string> = {
  type_a: "Type A · well-established, distinctive, consistent",
  type_b: "Type B · existing but inconsistent or generic",
  type_c: "Type C · existing but mismatched with offering",
  type_d: "Type D · insufficient observable presence",
};

const VERDICT_COLORS: Record<BrandClassVerdict, string> = {
  type_a: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-300",
  type_b: "bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-300",
  type_c: "bg-orange-500/15 text-orange-700 border-orange-500/30 dark:text-orange-300",
  type_d: "bg-slate-500/15 text-slate-700 border-slate-500/30 dark:text-slate-300",
};

type ViewState =
  | { kind: "loading" }
  | { kind: "loaded"; data: ObservationApiResponse }
  | { kind: "error"; message: string };

export function ObservationView({ siteId }: { siteId: string }) {
  // Single discriminated state — keyed on siteId so it resets via remount on
  // siteId change without violating react-hooks/set-state-in-effect.
  return <ObservationFetcher key={siteId} siteId={siteId} />;
}

function ObservationFetcher({ siteId }: { siteId: string }) {
  const [state, setState] = useState<ViewState>({ kind: "loading" });
  /** Which run is currently expanded in the grid. Defaults to the latest
   *  on first load; user can swap by clicking a row in the run history. */
  const [selectedRunNumber, setSelectedRunNumber] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/ops/brand-identity/observation?siteId=${siteId}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`API ${r.status}`);
        return r.json() as Promise<ObservationApiResponse>;
      })
      .then((data) => {
        if (cancelled) return;
        setState({ kind: "loaded", data });
        // Auto-select latest run on first load.
        if (data.runs.length > 0) {
          setSelectedRunNumber(data.runs[0].runNumber);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setState({ kind: "error", message: e instanceof Error ? e.message : String(e) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  /** Optimistic-update approval state for a descriptor after a successful commit. */
  const recordApproval = useCallback(
    (descriptorKey: string, substrateId: string) => {
      setState((s) => {
        if (s.kind !== "loaded") return s;
        return {
          ...s,
          data: {
            ...s.data,
            approvals: {
              ...s.data.approvals,
              [descriptorKey]: {
                source: "observation_approved",
                approvedAt: new Date().toISOString(),
                observationSubstrateId: substrateId,
                hasDeclared: true,
              },
            },
          },
        };
      });
    },
    [],
  );

  return (
    <Shell>
      <ObservationBody
        state={state}
        siteId={siteId}
        selectedRunNumber={selectedRunNumber}
        onSelectRun={setSelectedRunNumber}
        onApproved={recordApproval}
      />
    </Shell>
  );
}

/** Page shell — renders the bucket-tabs nav strip on every state. */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-4 space-y-4 pb-12">
      <DomainTabs domain="observation" />
      {children}
    </div>
  );
}

interface ApproveHandler {
  (descriptorKey: string, substrateId: string): void;
}

function ObservationBody({
  state,
  siteId,
  selectedRunNumber,
  onSelectRun,
  onApproved,
}: {
  state: ViewState;
  siteId: string;
  selectedRunNumber: number | null;
  onSelectRun: (runNumber: number) => void;
  onApproved: ApproveHandler;
}) {
  if (state.kind === "error") {
    return (
      <div className="p-2">
        <h2 className="text-sm font-medium mb-2">Brand Identity — Public Presence</h2>
        <p className="text-xs text-red-600">Failed to load analysis: {state.message}</p>
      </div>
    );
  }

  if (state.kind === "loading") {
    return (
      <div className="p-2">
        <h2 className="text-sm font-medium mb-2">Brand Identity — Public Presence</h2>
        <p className="text-xs text-muted">Loading…</p>
      </div>
    );
  }

  if (state.data.runs.length === 0) {
    return (
      <div className="p-2">
        <h2 className="text-sm font-medium mb-2">Brand Identity — Public Presence</h2>
        <p className="text-xs text-muted">
          No public presence analysis has been generated yet for this site. Run
          the aesthetic extractor from the Brand Identity page to produce one.
        </p>
      </div>
    );
  }

  const runs = state.data.runs;
  const latestRunNumber = runs[0].runNumber;
  const selected = runs.find((r) => r.runNumber === selectedRunNumber) ?? runs[0];
  const isLatestSelected = selected.runNumber === latestRunNumber;
  const approvals = state.data.approvals;
  const ctx: DescriptorCardContext = {
    siteId,
    substrateId: selected.id,
    approvals,
    onApproved,
    // Approval controls only meaningful for the LATEST run — that's "current
    // brand truth." Historical runs are read-only snapshots.
    readOnly: !isLatestSelected,
  };

  return (
    <div className="space-y-8 max-w-5xl">
      <PpaTrajectoryChart runs={runs} selectedRunNumber={selected.runNumber} onSelectRun={onSelectRun} />
      <RunHistoryGrid
        runs={runs}
        selectedRunNumber={selected.runNumber}
        onSelectRun={onSelectRun}
      />
      {!isLatestSelected && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300">
          Viewing historical run #{selected.runNumber}. Approval controls are
          disabled — only the latest run (#{latestRunNumber}) represents
          current brand truth. Click the latest run above to approve descriptors.
        </div>
      )}
      <Header payload={selected.payload} updatedAt={selected.updatedAt} runNumber={selected.runNumber} />
      <Scores payload={selected.payload} />
      {selected.payload.distinctive_elements_vs_category_defaults?.length > 0 && (
        <Section title="Distinctive elements vs category defaults">
          <BulletList items={selected.payload.distinctive_elements_vs_category_defaults} />
        </Section>
      )}
      {selected.payload.gaps_and_absences?.length > 0 && (
        <Section title="Gaps & absences">
          <BulletList items={selected.payload.gaps_and_absences} />
        </Section>
      )}
      <DomainSection title="Verbal" slots={verbalSlots(selected.payload)} ctx={ctx} />
      <DomainSection title="Strategic" slots={strategicSlots(selected.payload)} ctx={ctx} />
      <DomainSection title="Visual" slots={visualSlots(selected.payload)} ctx={ctx} />
      <DomainSection title="Sonic" slots={sonicSlots(selected.payload)} ctx={ctx} />
      <GenerationFooter generationMetadata={selected.generationMetadata} />
    </div>
  );
}

/**
 * Run history grid — the timeline-of-snapshots UI surface per
 * [[ppa-cma-recurring-quality-gate]]. Each row is a PPA run with its
 * metadata pill; clicking a row swaps the body to that run's observation.
 * Latest run highlighted as "current" with a green dot.
 */
function RunHistoryGrid({
  runs,
  selectedRunNumber,
  onSelectRun,
}: {
  runs: ObservationRun[];
  selectedRunNumber: number;
  onSelectRun: (runNumber: number) => void;
}) {
  const latestRunNumber = runs[0].runNumber;
  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">Run history</h2>
        <span className="text-[11px] text-muted">{runs.length} {runs.length === 1 ? "run" : "runs"}</span>
      </div>
      <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
        {runs.map((run) => {
          const isSelected = run.runNumber === selectedRunNumber;
          const isLatest = run.runNumber === latestRunNumber;
          const verdict = run.payload.meta?.verdict;
          const confidencePct = Math.round((run.payload.meta?.confidence ?? 0) * 100);
          return (
            <button
              key={run.id}
              type="button"
              onClick={() => onSelectRun(run.runNumber)}
              className={`w-full px-3 py-2.5 text-left transition-colors flex items-center gap-3 ${
                isSelected
                  ? "bg-accent/15 border-l-2 border-l-accent"
                  : "hover:bg-card border-l-2 border-l-transparent"
              }`}
            >
              <span className="font-mono text-[11px] text-muted w-12 shrink-0">
                #{run.runNumber}
              </span>
              <span className="text-xs text-foreground whitespace-nowrap shrink-0">
                {new Date(run.generationMetadata?.generated_at ?? run.createdAt).toLocaleString()}
              </span>
              {verdict && (
                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium shrink-0 ${VERDICT_COLORS[verdict]}`}>
                  {verdict.replace("type_", "Type ").toUpperCase()}
                </span>
              )}
              <span className="text-[10px] text-muted shrink-0">
                {confidencePct}% conf
              </span>
              <span className="text-[10px] text-muted/70 font-mono truncate flex-1">
                {run.generationMetadata?.model ?? "unknown model"}
                {run.generationMetadata?.prompt_version && ` · ${run.generationMetadata.prompt_version}`}
              </span>
              {isLatest && (
                <span className="inline-flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:text-green-300 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  Current
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Parse a score string like "5/10 — explanation prose" → numeric 5.
 * Returns null if the prefix doesn't match (defensive against prompt changes).
 */
function parseScoreNumeric(scoreString: string | undefined | null): number | null {
  if (!scoreString) return null;
  const match = scoreString.match(/^(\d+)\s*\/\s*10/);
  return match ? Number(match[1]) : null;
}

/** Short Type-A/B/C/D label, e.g. "type_a" → "A". */
function shortVerdict(v: BrandClassVerdict | undefined): string {
  if (!v) return "?";
  return v.replace("type_", "").toUpperCase();
}

/**
 * PpaTrajectoryChart — time-series view of the brand's PPA trajectory
 * across runs. Per [[ppa-cma-recurring-quality-gate]] the diff between
 * runs IS the deliverable; this is the at-a-glance summary surface
 * (recurring quality gate doctrine, step 4 lifecycle UI).
 *
 * Three lines: visual_consistency, distinctiveness, alignment_with_positioning.
 * Y axis 0-10 (fixed). X axis = run number ascending (oldest → newest).
 * Below the chart: row of verdict pills, one per run, with the currently
 * selected run highlighted. Click any pill to swap the body to that run.
 *
 * For a single run, the chart is suppressed in favor of a prompt to
 * accumulate more runs — the trajectory signal needs ≥2 points.
 */
function PpaTrajectoryChart({
  runs,
  selectedRunNumber,
  onSelectRun,
}: {
  runs: ObservationRun[];
  selectedRunNumber: number;
  onSelectRun: (runNumber: number) => void;
}) {
  // Chart data oldest→newest. The runs array is newest-first.
  const data = [...runs]
    .reverse()
    .map((run) => ({
      runNumber: run.runNumber,
      visual: parseScoreNumeric(run.payload.meta?.visual_consistency_score),
      distinctiveness: parseScoreNumeric(run.payload.meta?.distinctiveness_score),
      alignment: parseScoreNumeric(run.payload.meta?.alignment_with_positioning_score),
      verdict: run.payload.meta?.verdict,
      verdictShort: shortVerdict(run.payload.meta?.verdict),
      generatedAt: run.generationMetadata?.generated_at ?? run.createdAt,
    }));

  if (runs.length < 2) {
    return (
      <section className="rounded-lg border border-dashed border-border bg-card/30 px-4 py-6 text-center">
        <h2 className="text-sm font-semibold mb-1">Trajectory</h2>
        <p className="text-[11px] text-muted leading-relaxed max-w-md mx-auto">
          Re-run the PPA after the brand evolves to see scores + verdict trajectory across runs.
          Trajectory needs at least two runs for diff signal.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">Trajectory</h2>
        <span className="text-[11px] text-muted">
          Scores + verdict across {runs.length} runs (oldest → newest)
        </span>
      </div>
      <div className="rounded-lg border border-border bg-card p-3">
        {/* Line chart of the 3 scores */}
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 10, right: 16, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" strokeOpacity={0.3} />
              <XAxis
                dataKey="runNumber"
                type="number"
                domain={[data[0].runNumber, data[data.length - 1].runNumber]}
                ticks={data.map((d) => d.runNumber)}
                tickFormatter={(v) => `#${v}`}
                tick={{ fontSize: 11, fill: "currentColor" }}
                className="text-muted"
              />
              <YAxis
                domain={[0, 10]}
                ticks={[0, 2, 4, 6, 8, 10]}
                tick={{ fontSize: 11, fill: "currentColor" }}
                className="text-muted"
                width={32}
              />
              <Tooltip content={<TrajectoryTooltip />} />
              <Line
                type="monotone"
                dataKey="visual"
                name="Visual consistency"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="distinctiveness"
                name="Distinctiveness"
                stroke="#a855f7"
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="alignment"
                name="Alignment with positioning"
                stroke="#10b981"
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
                connectNulls
              />
              {/* Highlight the selected run with a reference dot per line */}
              {(() => {
                const selectedPoint = data.find((d) => d.runNumber === selectedRunNumber);
                if (!selectedPoint) return null;
                return (
                  <>
                    {selectedPoint.visual !== null && (
                      <ReferenceDot x={selectedPoint.runNumber} y={selectedPoint.visual} r={7} fill="#3b82f6" stroke="white" strokeWidth={2} />
                    )}
                    {selectedPoint.distinctiveness !== null && (
                      <ReferenceDot x={selectedPoint.runNumber} y={selectedPoint.distinctiveness} r={7} fill="#a855f7" stroke="white" strokeWidth={2} />
                    )}
                    {selectedPoint.alignment !== null && (
                      <ReferenceDot x={selectedPoint.runNumber} y={selectedPoint.alignment} r={7} fill="#10b981" stroke="white" strokeWidth={2} />
                    )}
                  </>
                );
              })()}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-4 pt-1 text-[10px] text-muted">
          <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ background: "#3b82f6" }} />Visual consistency</span>
          <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ background: "#a855f7" }} />Distinctiveness</span>
          <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ background: "#10b981" }} />Alignment</span>
        </div>

        {/* Verdict pill timeline */}
        <div className="mt-3 pt-3 border-t border-border">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-wide text-muted shrink-0">Brand class</span>
            {data.map((point) => {
              const isSelected = point.runNumber === selectedRunNumber;
              return (
                <button
                  key={point.runNumber}
                  type="button"
                  onClick={() => onSelectRun(point.runNumber)}
                  title={`Run #${point.runNumber} · ${new Date(point.generatedAt).toLocaleString()} · ${VERDICT_LABEL[point.verdict as BrandClassVerdict] ?? "unknown"}`}
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium transition-all ${
                    point.verdict ? VERDICT_COLORS[point.verdict] : "border-slate-500/30 bg-slate-500/10 text-slate-700"
                  } ${isSelected ? "ring-2 ring-accent ring-offset-1 ring-offset-card" : "hover:scale-105"}`}
                >
                  #{point.runNumber} · {point.verdictShort}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

interface TooltipPayloadItem {
  name: string;
  value: number;
  color: string;
}

function TrajectoryTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: number;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded border border-border bg-card px-2 py-1.5 shadow-md text-[10px]">
      <div className="font-mono text-muted mb-0.5">Run #{label}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-foreground">{p.name}</span>
          <span className="ml-auto font-mono text-foreground">{p.value}/10</span>
        </div>
      ))}
    </div>
  );
}

interface DescriptorCardContext {
  siteId: string;
  substrateId: string;
  approvals: Record<string, ApprovalStatus>;
  onApproved: ApproveHandler;
  /** When true, approval controls render disabled (historical run view). */
  readOnly: boolean;
}

function Header({
  payload,
  updatedAt,
  runNumber,
}: {
  payload: BrandIdentityObservationPayload;
  updatedAt: string;
  runNumber: number;
}) {
  const verdict = payload.meta.verdict;
  const confidencePct = Math.round((payload.meta.confidence ?? 0) * 100);
  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-3 flex-wrap">
        <h1 className="text-xl font-semibold">Brand Identity — Public Presence Analysis</h1>
        <span className="font-mono text-xs text-muted">Run #{runNumber}</span>
        <span className="text-xs text-muted">updated {new Date(updatedAt).toLocaleString()}</span>
      </div>
      <div className="flex items-center gap-3">
        <span
          className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${VERDICT_COLORS[verdict]}`}
        >
          {VERDICT_LABEL[verdict]}
        </span>
        <span className="text-xs text-muted">
          confidence <span className="font-medium text-foreground">{confidencePct}%</span>
        </span>
      </div>
      <p className="text-xs text-muted">
        What we found in the wild — observed from the brand&apos;s publicly accessible surfaces
        (website + GBP + signage) with agency-style discipline: factual observation only,
        no creative interpretation, no recommendations. Sibling pipeline to the CMA; the two
        bundle as the agency&apos;s opening-move assessment of this brand.
      </p>
    </div>
  );
}

function Scores({ payload }: { payload: BrandIdentityObservationPayload }) {
  const m = payload.meta;
  return (
    <Section title="Scores">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <ScoreCard label="Visual consistency" value={m.visual_consistency_score} />
        <ScoreCard label="Distinctiveness" value={m.distinctiveness_score} />
        <ScoreCard label="Alignment with positioning" value={m.alignment_with_positioning_score} />
      </div>
    </Section>
  );
}

function ScoreCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border bg-card p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-xs leading-relaxed text-foreground">{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium border-b border-border pb-1">{title}</h2>
      {children}
    </section>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5 text-xs leading-relaxed text-foreground">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2">
          <span className="text-muted shrink-0">·</span>
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

// ── Domain rendering ────────────────────────────────────────────────────────

interface DescriptorSlot {
  key: string;
  label: string;
  observation: DescriptorObservation<unknown> | null;
  /** Override for the default "Not observable from these sources" text when
   * the slot is structurally null for a specific reason (e.g. guardrails). */
  nullReason?: string;
}

/**
 * Per-domain note shown ABOVE the descriptor cards when the domain has a
 * structural reason its slots are absent/limited under public-presence
 * analysis. Without this, owners read N "not observable" cards and can't tell
 * whether the analysis failed vs the signal-source is out of scope.
 */
const DOMAIN_NOTES: Record<string, string> = {
  Sonic:
    "Sonic identity (voice, music, sound) is out of scope for public presence analysis — these signals populate from audio-identity analysis when CTV ads, podcasts, jingles, or voiceover samples are observed. None of those sources are part of this pipeline.",
};

function DomainSection({
  title,
  slots,
  ctx,
}: {
  title: string;
  slots: DescriptorSlot[];
  ctx: DescriptorCardContext;
}) {
  const note = DOMAIN_NOTES[title];
  const allNull = slots.every((s) => s.observation === null);
  return (
    <Section title={title}>
      {note && (
        <p className="text-[11px] italic text-muted leading-relaxed">{note}</p>
      )}
      {allNull && note ? null : (
        <div className="space-y-3">
          {slots.map((s) => (
            <DescriptorCard key={s.key} slot={s} ctx={ctx} />
          ))}
        </div>
      )}
    </Section>
  );
}

function DescriptorCard({
  slot,
  ctx,
}: {
  slot: DescriptorSlot;
  ctx: DescriptorCardContext;
}) {
  const isNull = slot.observation === null;
  // Extract the bare descriptor key for approval API (catalog uses bare keys,
  // not domain-prefixed). slot.key is "domain.key"; strip the prefix.
  const bareKey = slot.key.split(".").slice(1).join(".");
  const approval = ctx.approvals[bareKey];
  return (
    <div className="rounded border border-border bg-card p-3">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <span className="text-xs font-medium">{slot.label}</span>
          <span className="ml-2 text-[10px] text-muted">{slot.key}</span>
        </div>
        <ApprovalControl
          isNull={isNull}
          slotKey={bareKey}
          approval={approval}
          ctx={ctx}
        />
      </div>
      {isNull ? (
        <p className="mt-2 text-[11px] italic text-muted leading-relaxed">
          {slot.nullReason ?? "Not observable from these sources."}
        </p>
      ) : (
        <div className="mt-2 space-y-2">
          <Observed observed={slot.observation!.observed} />
          {slot.observation!.evidence?.length > 0 && (
            <Evidence items={slot.observation!.evidence} />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Per-descriptor approval control: shows the approve button (when actionable),
 * the approved badge (when committed), or a non-actionable label for null /
 * owner-typed-but-not-from-observation cases.
 */
function ApprovalControl({
  isNull,
  slotKey,
  approval,
  ctx,
}: {
  isNull: boolean;
  slotKey: string;
  approval?: ApprovalStatus;
  ctx: DescriptorCardContext;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isNull) {
    return (
      <span className="text-[10px] uppercase tracking-wide text-muted shrink-0">
        not observable
      </span>
    );
  }

  if (approval?.source === "observation_approved") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300 shrink-0"
        title={approval.approvedAt ? `Approved ${new Date(approval.approvedAt).toLocaleString()}` : undefined}
      >
        ✓ Approved from observation
      </span>
    );
  }

  if (approval?.source === "owner_typed") {
    return (
      <span className="text-[10px] uppercase tracking-wide text-muted shrink-0" title="Owner-typed declared content exists; approving observation would overwrite it. Edit via the Creative bucket to manage owner-typed declarations.">
        owner-typed
      </span>
    );
  }

  // Historical run viewing — show context-aware affordance, not an active button.
  if (ctx.readOnly) {
    return (
      <span
        className="text-[10px] uppercase tracking-wide text-muted shrink-0"
        title="Switch to the latest run to approve descriptors"
      >
        historical view
      </span>
    );
  }

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/ops/brand-identity/observation/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId: ctx.siteId,
          descriptorKey: slotKey,
          observationSubstrateId: ctx.substrateId,
        }),
      });
      const json = (await res.json()) as { committed: boolean; reason?: string };
      if (!res.ok || !json.committed) {
        setError(json.reason || `API ${res.status}`);
        setSubmitting(false);
        return;
      }
      // Optimistic: notify parent so the approval badge replaces the button.
      ctx.onApproved(slotKey, ctx.substrateId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1 shrink-0">
      <button
        type="button"
        onClick={submit}
        disabled={submitting}
        className="rounded border border-accent/40 bg-accent/10 px-2 py-1 text-[10px] font-medium text-foreground hover:bg-accent/20 disabled:opacity-50"
      >
        {submitting ? "Approving…" : "Approve as canonical"}
      </button>
      {error && <span className="text-[10px] text-red-600 max-w-[12rem] text-right">{error}</span>}
    </div>
  );
}

function Observed({ observed }: { observed: unknown }) {
  // String → render as quoted prose.
  if (typeof observed === "string") {
    return <p className="text-xs leading-relaxed text-foreground">{observed}</p>;
  }
  // String[] → render as inline pills.
  if (Array.isArray(observed) && observed.every((v) => typeof v === "string")) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {(observed as string[]).map((v, i) => (
          <span key={i} className="rounded bg-muted/20 px-2 py-0.5 text-[11px]">
            {v}
          </span>
        ))}
      </div>
    );
  }
  // Object → render each key as a sub-block.
  if (observed && typeof observed === "object") {
    const entries = Object.entries(observed as Record<string, unknown>);
    return (
      <div className="space-y-2">
        {entries.map(([k, v]) => (
          <div key={k}>
            <div className="text-[10px] uppercase tracking-wide text-muted">{prettyKey(k)}</div>
            <div className="mt-0.5">
              <Observed observed={v} />
            </div>
          </div>
        ))}
      </div>
    );
  }
  // Fallback — JSON.
  return (
    <pre className="text-[11px] overflow-x-auto rounded bg-muted/10 p-2">
      {JSON.stringify(observed, null, 2)}
    </pre>
  );
}

function Evidence({ items }: { items: string[] }) {
  return (
    <details className="text-[11px]">
      <summary className="cursor-pointer text-muted hover:text-foreground">
        Evidence ({items.length})
      </summary>
      <ul className="mt-1.5 space-y-1 pl-3">
        {items.map((it, i) => (
          <li key={i} className="text-muted">
            <span className="text-muted/60">·</span> {it}
          </li>
        ))}
      </ul>
    </details>
  );
}

function GenerationFooter({
  generationMetadata,
}: {
  generationMetadata: { model: string; prompt_version: string; generated_at: string } | null;
}) {
  if (!generationMetadata) return null;
  return (
    <div className="border-t border-border pt-4 text-[10px] text-muted space-y-1">
      <div>
        Model: <span className="font-mono">{generationMetadata.model}</span>
        {" · "}Prompt: <span className="font-mono">{generationMetadata.prompt_version}</span>
        {" · "}Generated: {new Date(generationMetadata.generated_at).toLocaleString()}
      </div>
    </div>
  );
}

// ── Slot extractors ─────────────────────────────────────────────────────────

function verbalSlots(p: BrandIdentityObservationPayload): DescriptorSlot[] {
  return [
    { key: "verbal.tone",             label: "Tone",             observation: p.verbal.tone },
    { key: "verbal.lexicon",          label: "Lexicon",          observation: p.verbal.lexicon },
    { key: "verbal.avoid",            label: "Avoid",            observation: p.verbal.avoid },
    { key: "verbal.voice_source",     label: "Voice source",     observation: p.verbal.voice_source },
    { key: "verbal.mechanical_style", label: "Mechanical style", observation: p.verbal.mechanical_style },
    { key: "verbal.tagline",          label: "Tagline",          observation: p.verbal.tagline },
  ];
}

function strategicSlots(p: BrandIdentityObservationPayload): DescriptorSlot[] {
  return [
    { key: "strategic.offer",       label: "Offer",       observation: p.strategic.offer },
    { key: "strategic.positioning", label: "Positioning", observation: p.strategic.positioning },
    { key: "strategic.audience",    label: "Audience",    observation: p.strategic.audience },
    { key: "strategic.proof",       label: "Proof",       observation: p.strategic.proof },
    { key: "strategic.hooks",       label: "Hooks",       observation: p.strategic.hooks },
    { key: "strategic.cta",         label: "Call to action", observation: p.strategic.cta },
  ];
}

function visualSlots(p: BrandIdentityObservationPayload): DescriptorSlot[] {
  return [
    { key: "visual.aesthetic",          label: "Aesthetic",            observation: p.visual.aesthetic },
    { key: "visual.environmental_look", label: "Environmental look",   observation: p.visual.environmental_look },
    { key: "visual.subject_style",      label: "Subject style",        observation: p.visual.subject_style },
    { key: "visual.palette",            label: "Palette",              observation: p.visual.palette },
    { key: "visual.logo",               label: "Logo",                 observation: p.visual.logo },
    {
      key: "visual.do_not_show",
      label: "Do not show",
      observation: p.visual.do_not_show,
      nullReason:
        "Guardrails are owner-declared only — by definition not observable from any public source. This descriptor populates from the brand identity declaration phase, not from observation.",
    },
  ];
}

function sonicSlots(p: BrandIdentityObservationPayload): DescriptorSlot[] {
  return [
    { key: "sonic.voiceover_character", label: "Voiceover character", observation: p.sonic.voiceover_character },
    { key: "sonic.music_mood",          label: "Music mood",          observation: p.sonic.music_mood },
    { key: "sonic.sfx_style",           label: "SFX style",           observation: p.sonic.sfx_style },
    { key: "sonic.pronunciation",       label: "Pronunciation",       observation: p.sonic.pronunciation },
  ];
}

function prettyKey(k: string): string {
  return k.replace(/_/g, " ");
}

