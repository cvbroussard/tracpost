"use client";

import { useState, useEffect, useCallback } from "react";

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
  status: "pending" | "running" | "complete" | "failed";
  generatedAt: string;
  updatedAt: string;
  errorMessage: string | null;
  data: AnalysisPayload | null;
}

interface Site {
  id: string;
  name: string;
}

export function CompetitiveAnalysisClient({ subscriberId }: { subscriberId: string }) {
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string>("");
  const [analysis, setAnalysis] = useState<AnalysisRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load sites for this subscriber on mount
  useEffect(() => {
    fetch(`/api/admin/sites?subscription_id=${subscriberId}`)
      .then((r) => (r.ok ? r.json() : { sites: [] }))
      .then((d: { sites: Site[] }) => {
        setSites(d.sites || []);
        if (d.sites?.length > 0) setSelectedSiteId(d.sites[0].id);
      });
  }, [subscriberId]);

  // Load current analysis whenever selected site changes
  const loadAnalysis = useCallback(async () => {
    if (!selectedSiteId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/competitive-analysis/${selectedSiteId}`);
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      const d = await res.json();
      setAnalysis(d.analysis);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [selectedSiteId]);

  useEffect(() => {
    loadAnalysis();
  }, [loadAnalysis]);

  // Poll while analysis is running
  useEffect(() => {
    if (!analysis || (analysis.status !== "running" && analysis.status !== "pending")) return;
    const id = setInterval(loadAnalysis, 5000);
    return () => clearInterval(id);
  }, [analysis, loadAnalysis]);

  async function triggerRun() {
    if (!selectedSiteId) return;
    setTriggering(true);
    try {
      const res = await fetch(`/api/admin/competitive-analysis/${selectedSiteId}/run`, {
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

  if (!subscriberId) {
    return <div className="p-4 text-xs text-muted">Select a subscriber to view competitive analysis.</div>;
  }

  return (
    <div className="space-y-4 p-4">
      {/* Site picker + Trigger panel */}
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
            {analysis && (
              <span className="text-[10px] text-muted">
                {analysis.status === "complete" && `Last run: ${new Date(analysis.generatedAt).toLocaleString()}`}
                {analysis.status === "running" && <span className="text-accent">⏳ Running…</span>}
                {analysis.status === "pending" && <span className="text-muted">Queued…</span>}
                {analysis.status === "failed" && <span className="text-danger">✗ Failed</span>}
              </span>
            )}
            <button
              onClick={triggerRun}
              disabled={triggering || !selectedSiteId || analysis?.status === "running"}
              className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {triggering ? "Triggering…" : analysis ? "Run new analysis" : "Run analysis"}
            </button>
          </div>
        </div>
        {error && <p className="mt-2 text-[10px] text-danger">{error}</p>}
        {analysis?.errorMessage && (
          <p className="mt-2 text-[10px] text-danger">Last error: {analysis.errorMessage}</p>
        )}
      </div>

      {loading && !analysis && (
        <div className="rounded-xl border border-border bg-surface p-6 text-center text-xs text-muted shadow-card">
          Loading…
        </div>
      )}

      {analysis === null && !loading && (
        <div className="rounded-xl border border-border bg-surface p-6 text-center shadow-card">
          <p className="text-xs text-muted">No analysis run yet for this site.</p>
          <p className="mt-1 text-[10px] text-muted">Click "Run analysis" to generate the first competitive market report.</p>
        </div>
      )}

      {analysis?.status === "complete" && analysis.data && (
        <AnalysisDisplay payload={analysis.data} />
      )}
    </div>
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
