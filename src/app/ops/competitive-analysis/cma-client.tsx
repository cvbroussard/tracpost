"use client";

import { useState, useEffect, useCallback } from "react";
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
import { DomainTabs } from "@/app/ops/brand-identity/page";

interface SubscriberMetrics {
  placeId: string | null;
  rating: number | null;
  reviewCount: number | null;
  completenessScore: number | null;
  completenessMissing: string[];
  hasPhone: boolean;
  hasWebsite: boolean;
  hasAddress: boolean;
  socialProfileCount: number;
  categoryCount: number;
  serviceAreaCount: number;
}

interface Recommendation {
  kind: string;
  title: string;
  message: string;
  priority: "high" | "medium" | "low";
  reasoning: string;
  actionability: string;
}

interface RankingCompetitor {
  placeId: string;
  title: string;
  appearanceCount: number;
  averagePosition: number;
  score: number;
  rating?: number;
  reviewsCount?: number;
  type?: string;
  address?: string;
  website?: string;
  yearsInBusiness?: string;
}

interface TargetQuery {
  query: string;
  weight: string;
  gcid: string;
  placeName: string;
}

interface AnalysisPayload {
  generatedAt: string;
  subscriberCategories: Array<{ gcid: string; name: string; isPrimary: boolean }>;
  subscriberServiceAreas: Array<{ placeId: string; placeName: string }>;
  subscriberMetrics?: SubscriberMetrics;
  targetQueries: TargetQuery[];
  topCompetitors: RankingCompetitor[];
  totalCompetitorsObserved: number;
  serpQueriesRun: number;
  recommendations?: Recommendation[];
}

interface AnalysisRecord {
  id: string;
  runNumber: number;
  runPurpose: "diagnostic" | "verification" | "ad_hoc";
  status: "pending" | "running" | "complete" | "failed";
  generatedAt: string;
  updatedAt: string;
  errorMessage: string | null;
  data: AnalysisPayload | null;
  catalogSnapshotAt: string | null;
  websiteLastRegenAt: string | null;
}

const RUN_PURPOSE_LABEL: Record<AnalysisRecord["runPurpose"], string> = {
  diagnostic: "Diagnostic",
  verification: "Verification",
  ad_hoc: "Ad-hoc",
};

const RUN_PURPOSE_COLORS: Record<AnalysisRecord["runPurpose"], string> = {
  diagnostic: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  verification: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  ad_hoc: "border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-300",
};

export function CompetitiveAnalysisClient({ siteId }: { siteId: string }) {
  const [runs, setRuns] = useState<AnalysisRecord[]>([]);
  /** Which run is currently expanded. Defaults to latest on first load. */
  const [selectedRunNumber, setSelectedRunNumber] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Latest run is the convenience getter for polling + most "current" surfacing.
  const latestRun = runs[0] ?? null;
  const selectedRun =
    runs.find((r) => r.runNumber === selectedRunNumber) ?? latestRun;

  // Load all CMA runs for the active site (set via ManageShell context).
  // Per [[brand-identity-bucket-to-domain-restructure]]: site scope comes
  // from the manage shell, not an in-page picker.
  const loadAnalysis = useCallback(async () => {
    if (!siteId || siteId === "all") return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/competitive-analysis/${siteId}`);
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      const d = await res.json();
      const nextRuns: AnalysisRecord[] = d.runs ?? [];
      setRuns(nextRuns);
      // Auto-select latest run if no selection yet OR if the prior selection
      // is no longer present (e.g., site switch). Re-running adds a new
      // latest; we DON'T auto-jump — user keeps their current selection.
      setSelectedRunNumber((prev) => {
        if (prev !== null && nextRuns.some((r) => r.runNumber === prev)) return prev;
        return nextRuns[0]?.runNumber ?? null;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    loadAnalysis();
  }, [loadAnalysis]);

  // Poll while any run is still in-flight (running or pending) — the latest
  // run's state drives this; once it flips to complete/failed we stop polling.
  useEffect(() => {
    if (!latestRun || (latestRun.status !== "running" && latestRun.status !== "pending")) return;
    const id = setInterval(loadAnalysis, 5000);
    return () => clearInterval(id);
  }, [latestRun, loadAnalysis]);

  async function triggerRun() {
    if (!siteId || siteId === "all") return;
    setTriggering(true);
    try {
      const res = await fetch(`/api/admin/competitive-analysis/${siteId}/run`, {
        method: "POST",
      });
      if (!res.ok && res.status !== 202) throw new Error(`Trigger failed (${res.status})`);
      // Refresh state — the assembly creates a 'running' row immediately
      await loadAnalysis();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTriggering(false);
    }
  }

  return (
    <div className="space-y-4 p-4">
      <DomainTabs domain="competitive-analysis" />
      {/* Trigger panel — site comes from the manage shell context;
          ManagePage(requireSite) blocks render until a site is selected. */}
      <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <h3 className="text-xs font-semibold">Competitive Analysis</h3>
            <p className="mt-0.5 text-[10px] text-muted">
              Recurring measurement of brand vs local competitors. Bundles with Public Presence
              Analysis as the agency&apos;s opening-move deliverable.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {latestRun && (
              <span className="text-[10px] text-muted">
                {latestRun.status === "complete" && `Last run: ${new Date(latestRun.generatedAt).toLocaleString()}`}
                {latestRun.status === "running" && <span className="text-accent">⏳ Running…</span>}
                {latestRun.status === "pending" && <span className="text-muted">Queued…</span>}
                {latestRun.status === "failed" && <span className="text-danger">✗ Failed</span>}
              </span>
            )}
            <button
              onClick={triggerRun}
              disabled={triggering || latestRun?.status === "running"}
              className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {triggering ? "Triggering…" : latestRun ? "Run new analysis" : "Run analysis"}
            </button>
          </div>
        </div>
        {error && <p className="mt-2 text-[10px] text-danger">{error}</p>}
        {latestRun?.errorMessage && (
          <p className="mt-2 text-[10px] text-danger">Last error: {latestRun.errorMessage}</p>
        )}
      </div>

      {loading && runs.length === 0 && (
        <div className="rounded-xl border border-border bg-surface p-6 text-center text-xs text-muted shadow-card">
          Loading…
        </div>
      )}

      {runs.length === 0 && !loading && (
        <div className="rounded-xl border border-border bg-surface p-6 text-center shadow-card">
          <p className="text-xs text-muted">No analysis run yet for this site.</p>
          <p className="mt-1 text-[10px] text-muted">Click "Run analysis" to generate the first competitive market report.</p>
        </div>
      )}

      {/* Trajectory chart — completeness + review count + rating across runs. */}
      {runs.length > 0 && (
        <CmaTrajectoryChart
          runs={runs}
          selectedRunNumber={selectedRun?.runNumber ?? null}
          onSelectRun={setSelectedRunNumber}
        />
      )}

      {/* Run history grid — list of all CMA runs, newest first. Clicking
          a row swaps the body below to that run's analysis_data. */}
      {runs.length > 0 && (
        <CmaRunHistoryGrid
          runs={runs}
          selectedRunNumber={selectedRun?.runNumber ?? null}
          onSelectRun={setSelectedRunNumber}
        />
      )}

      {/* Selected run body — mirrors the PPA observation view's pattern.
          Shows "viewing historical" notice when the selected run isn't
          the latest. */}
      {selectedRun && selectedRun.runNumber !== latestRun?.runNumber && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300">
          Viewing historical run #{selectedRun.runNumber}
          {latestRun ? ` (latest is #${latestRun.runNumber})` : ""}. Trigger
          a new analysis above to refresh the current state.
        </div>
      )}

      {selectedRun?.status === "complete" && selectedRun.data && (
        <AnalysisDisplay payload={selectedRun.data} />
      )}
      {selectedRun?.status === "running" && (
        <div className="rounded-xl border border-border bg-surface p-6 text-center text-xs text-muted shadow-card">
          <span className="text-accent">⏳ Run #{selectedRun.runNumber} in progress…</span>
        </div>
      )}
      {selectedRun?.status === "failed" && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center text-xs text-red-700 shadow-card">
          <p>Run #{selectedRun.runNumber} failed: {selectedRun.errorMessage ?? "no error message"}</p>
        </div>
      )}
    </div>
  );
}

/**
 * CmaTrajectoryChart — time-series view of the brand's CMA trajectory
 * across runs. Mirrors the PpaTrajectoryChart pattern per
 * [[ppa-cma-recurring-quality-gate]].
 *
 * Plots subscriberMetrics.completenessScore (0-100) as the primary signal —
 * the strongest "did the brand improve" indicator. Below the chart: a
 * pill timeline of run_purpose (Diagnostic / Verification / Ad-hoc),
 * one per run, click-to-select.
 *
 * <2 runs: render a "needs ≥2 runs" placeholder instead of a chart.
 */
function CmaTrajectoryChart({
  runs,
  selectedRunNumber,
  onSelectRun,
}: {
  runs: AnalysisRecord[];
  selectedRunNumber: number | null;
  onSelectRun: (runNumber: number) => void;
}) {
  const completeRuns = runs.filter((r) => r.status === "complete" && r.data);

  if (completeRuns.length < 2) {
    return (
      <section className="rounded-lg border border-dashed border-border bg-card/30 px-4 py-6 text-center">
        <h2 className="text-sm font-semibold mb-1">Trajectory</h2>
        <p className="text-[11px] text-muted leading-relaxed max-w-md mx-auto">
          Re-run the CMA after the brand evolves to see completeness + rating + review-count trajectory across runs.
          Trajectory needs at least two complete runs for diff signal.
        </p>
      </section>
    );
  }

  // Oldest → newest for chronological reading.
  const data = [...completeRuns]
    .reverse()
    .map((r) => {
      const m = r.data?.subscriberMetrics;
      return {
        runNumber: r.runNumber,
        completeness: m?.completenessScore ?? null,
        rating: m?.rating ?? null,
        reviewCount: m?.reviewCount ?? null,
        totalCompetitors: r.data?.totalCompetitorsObserved ?? null,
        runPurpose: r.runPurpose,
        generatedAt: r.generatedAt,
      };
    });

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">Trajectory</h2>
        <span className="text-[11px] text-muted">
          Subscriber metrics across {completeRuns.length} runs (oldest → newest)
        </span>
      </div>
      <div className="rounded-lg border border-border bg-card p-3">
        {/* Completeness primary line — the brand health signal */}
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
                yAxisId="left"
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                tick={{ fontSize: 11, fill: "currentColor" }}
                className="text-muted"
                width={32}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                domain={[0, 5]}
                ticks={[0, 1, 2, 3, 4, 5]}
                tick={{ fontSize: 11, fill: "currentColor" }}
                className="text-muted"
                width={28}
              />
              <Tooltip content={<CmaTooltip />} />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="completeness"
                name="Completeness (0-100)"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
                connectNulls
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="rating"
                name="GBP rating (0-5)"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
                connectNulls
              />
              {(() => {
                const selectedPoint = data.find((d) => d.runNumber === selectedRunNumber);
                if (!selectedPoint) return null;
                return (
                  <>
                    {selectedPoint.completeness !== null && (
                      <ReferenceDot yAxisId="left" x={selectedPoint.runNumber} y={selectedPoint.completeness} r={7} fill="#3b82f6" stroke="white" strokeWidth={2} />
                    )}
                    {selectedPoint.rating !== null && (
                      <ReferenceDot yAxisId="right" x={selectedPoint.runNumber} y={selectedPoint.rating} r={7} fill="#f59e0b" stroke="white" strokeWidth={2} />
                    )}
                  </>
                );
              })()}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-4 pt-1 text-[10px] text-muted">
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: "#3b82f6" }} />
            Completeness (0-100, left axis)
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: "#f59e0b" }} />
            GBP rating (0-5, right axis)
          </span>
        </div>

        {/* Run-purpose pill timeline */}
        <div className="mt-3 pt-3 border-t border-border">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-wide text-muted shrink-0">Run purpose</span>
            {data.map((point) => {
              const isSelected = point.runNumber === selectedRunNumber;
              const purpose = point.runPurpose;
              return (
                <button
                  key={point.runNumber}
                  type="button"
                  onClick={() => onSelectRun(point.runNumber)}
                  title={`Run #${point.runNumber} · ${new Date(point.generatedAt).toLocaleString()} · ${RUN_PURPOSE_LABEL[purpose] ?? "Unknown"}`}
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium transition-all ${
                    RUN_PURPOSE_COLORS[purpose] ?? "border-slate-500/30 bg-slate-500/10 text-slate-700"
                  } ${isSelected ? "ring-2 ring-accent ring-offset-1 ring-offset-card" : "hover:scale-105"}`}
                >
                  #{point.runNumber} · {RUN_PURPOSE_LABEL[purpose] ?? purpose}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

interface CmaTooltipPayloadItem {
  name: string;
  value: number;
  color: string;
}

function CmaTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: CmaTooltipPayloadItem[];
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
          <span className="ml-auto font-mono text-foreground">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * CmaRunHistoryGrid — vertical list of all CMA runs, newest first. Each
 * row is clickable to swap the body to that run's analysis_data. Mirrors
 * the PPA RunHistoryGrid pattern.
 */
function CmaRunHistoryGrid({
  runs,
  selectedRunNumber,
  onSelectRun,
}: {
  runs: AnalysisRecord[];
  selectedRunNumber: number | null;
  onSelectRun: (runNumber: number) => void;
}) {
  const latestRunNumber = runs[0]?.runNumber;
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
          const completeness = run.data?.subscriberMetrics?.completenessScore ?? null;
          const recCount = run.data?.recommendations?.length ?? 0;
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
                {new Date(run.generatedAt).toLocaleString()}
              </span>
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium shrink-0 ${RUN_PURPOSE_COLORS[run.runPurpose] ?? "border-slate-500/30 bg-slate-500/10 text-slate-700"}`}>
                {RUN_PURPOSE_LABEL[run.runPurpose] ?? run.runPurpose}
              </span>
              {run.status === "complete" && completeness !== null && (
                <span className="text-[10px] text-muted shrink-0">
                  completeness {completeness}/100
                </span>
              )}
              {run.status === "complete" && (
                <span className="text-[10px] text-muted shrink-0">
                  {recCount} {recCount === 1 ? "rec" : "recs"}
                </span>
              )}
              {run.status === "running" && (
                <span className="text-[10px] text-accent shrink-0">⏳ Running…</span>
              )}
              {run.status === "failed" && (
                <span className="text-[10px] text-red-600 shrink-0">✗ Failed</span>
              )}
              <span className="flex-1" />
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

function AnalysisDisplay({ payload }: { payload: AnalysisPayload }) {
  return (
    <div className="space-y-4">
      {/* Recommendations — the strategic artifact */}
      <Section title="Strategic Recommendations" subtitle={`${payload.recommendations?.length || 0} surfaced from the data`}>
        {payload.recommendations && payload.recommendations.length > 0 ? (
          <div className="space-y-2">
            {payload.recommendations.map((r, i) => (
              <RecommendationCard key={i} rec={r} index={i + 1} />
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted">No recommendations generated.</p>
        )}
      </Section>

      {/* Subscriber metrics */}
      {payload.subscriberMetrics && (
        <Section title="Subscriber's Baseline" subtitle="Where they stand today — the numbers behind every recommendation">
          <SubscriberMetricsCard metrics={payload.subscriberMetrics} />
        </Section>
      )}

      {/* Competitor leaderboard */}
      <Section title={`Ranking Competitors (top ${payload.topCompetitors.length} of ${payload.totalCompetitorsObserved} observed)`} subtitle="Real businesses outranking the subscriber across the queried SERPs">
        <CompetitorTable competitors={payload.topCompetitors} />
      </Section>

      {/* Target queries */}
      <Section title={`Target Queries (${payload.serpQueriesRun} run)`} subtitle="The searches that drive the subscriber's potential customers">
        <QueriesList queries={payload.targetQueries} />
      </Section>

      {/* Metadata footer */}
      <div className="rounded-xl border border-border bg-surface p-3 text-[10px] text-muted shadow-card">
        Generated {new Date(payload.generatedAt).toLocaleString()} ·{" "}
        {payload.serpQueriesRun} SerpAPI credits (~${(payload.serpQueriesRun * 0.0075).toFixed(3)}) +{" "}
        1 Anthropic Haiku call (~$0.005)
      </div>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
      <div className="mb-3">
        <h3 className="text-sm font-medium">{title}</h3>
        {subtitle && <p className="mt-0.5 text-[10px] text-muted">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function RecommendationCard({ rec, index }: { rec: Recommendation; index: number }) {
  const priorityColor =
    rec.priority === "high"
      ? "border-l-danger bg-danger/5"
      : rec.priority === "medium"
        ? "border-l-warning bg-warning/5"
        : "border-l-success bg-success/5";
  const priorityIcon = rec.priority === "high" ? "🔴" : rec.priority === "medium" ? "🟡" : "🟢";
  return (
    <div className={`border-l-2 rounded-r p-3 ${priorityColor}`}>
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-xs font-semibold">
          {priorityIcon} {index}. {rec.title}
        </h4>
        <span className="text-[9px] text-muted shrink-0">{rec.kind}</span>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed">{rec.message}</p>
      <div className="mt-2 space-y-1 border-t border-border/50 pt-2">
        <p className="text-[10px] text-muted">
          <span className="font-semibold">Why:</span> {rec.reasoning}
        </p>
        <p className="text-[10px] text-muted">
          <span className="font-semibold">Do:</span> {rec.actionability}
        </p>
      </div>
    </div>
  );
}

function SubscriberMetricsCard({ metrics }: { metrics: SubscriberMetrics }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1 md:grid-cols-3">
      <MetricRow label="Google rating" value={metrics.rating !== null ? metrics.rating.toFixed(1) : "—"} />
      <MetricRow label="Review count" value={metrics.reviewCount !== null ? String(metrics.reviewCount) : "—"} />
      <MetricRow label="GBP completeness" value={metrics.completenessScore !== null ? `${metrics.completenessScore}/100` : "—"} />
      <MetricRow label="Website" value={metrics.hasWebsite ? "yes" : "no"} ok={metrics.hasWebsite} />
      <MetricRow label="Phone" value={metrics.hasPhone ? "yes" : "no"} ok={metrics.hasPhone} />
      <MetricRow label="Address" value={metrics.hasAddress ? "yes" : "no (service-area)"} />
      <MetricRow label="Categories" value={String(metrics.categoryCount)} />
      <MetricRow label="Service areas" value={String(metrics.serviceAreaCount)} />
      <MetricRow label="Social profiles" value={String(metrics.socialProfileCount)} />
      {metrics.completenessMissing.length > 0 && (
        <div className="col-span-2 mt-2 border-t border-border pt-2 md:col-span-3">
          <p className="text-[10px] text-muted">
            <span className="font-semibold">GBP fields missing:</span> {metrics.completenessMissing.join(", ")}
          </p>
        </div>
      )}
    </div>
  );
}

function MetricRow({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-border py-1 text-xs last:border-0">
      <div className="flex items-center gap-1.5">
        {ok !== undefined && <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-success" : "bg-danger"}`} />}
        <span className="text-[10px] text-muted">{label}</span>
      </div>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function CompetitorTable({ competitors }: { competitors: RankingCompetitor[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-left text-[10px] text-muted">
            <th className="py-1.5 pr-2 font-medium">#</th>
            <th className="py-1.5 pr-2 font-medium">Business</th>
            <th className="py-1.5 pr-2 font-medium">Type</th>
            <th className="py-1.5 pr-2 text-right font-medium">Rating</th>
            <th className="py-1.5 pr-2 text-right font-medium">Reviews</th>
            <th className="py-1.5 pr-2 text-right font-medium">Appearances</th>
            <th className="py-1.5 pr-2 text-right font-medium">Avg pos</th>
            <th className="py-1.5 pr-2 text-right font-medium">Score</th>
          </tr>
        </thead>
        <tbody>
          {competitors.map((c, i) => (
            <tr key={c.placeId} className="border-b border-border last:border-0 hover:bg-surface-hover">
              <td className="py-1.5 pr-2 text-muted">{i + 1}</td>
              <td className="py-1.5 pr-2">
                <div className="font-medium">{c.title}</div>
                {c.website && (
                  <a
                    href={c.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[9px] text-accent hover:underline"
                  >
                    {c.website.replace(/^https?:\/\//, "").replace(/\/$/, "").slice(0, 40)}
                  </a>
                )}
              </td>
              <td className="py-1.5 pr-2 text-[10px] text-muted">{c.type || "—"}</td>
              <td className="py-1.5 pr-2 text-right">{c.rating ? `⭐ ${c.rating}` : "—"}</td>
              <td className="py-1.5 pr-2 text-right">{c.reviewsCount ?? "—"}</td>
              <td className="py-1.5 pr-2 text-right">{c.appearanceCount}</td>
              <td className="py-1.5 pr-2 text-right">{c.averagePosition.toFixed(1)}</td>
              <td className="py-1.5 pr-2 text-right font-semibold">{c.score.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function QueriesList({ queries }: { queries: TargetQuery[] }) {
  return (
    <div className="space-y-0.5">
      {queries.map((q, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <span className="w-5 text-right text-[10px] text-muted">{i + 1}</span>
          <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${
            q.weight === "primary"
              ? "bg-accent/10 text-accent"
              : q.weight === "additional"
                ? "bg-blue-500/10 text-blue-600"
                : "bg-gray-500/10 text-gray-600"
          }`}>
            {q.weight}
          </span>
          <span className="flex-1">{q.query}</span>
        </div>
      ))}
    </div>
  );
}
