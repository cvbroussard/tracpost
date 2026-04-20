"use client";

import { useState, useEffect } from "react";
import { EmptyState } from "@/components/empty-state";

interface DailyMetric {
  date: string;
  value: number;
}

interface PerformanceData {
  websiteClicks: DailyMetric[];
  callClicks: DailyMetric[];
  directionRequests: DailyMetric[];
  searchImpressions: DailyMetric[];
  mapsImpressions: DailyMetric[];
  searchKeywords: Array<{ keyword: string; impressions: number }>;
}

function sum(metrics: DailyMetric[]): number {
  return metrics.reduce((acc, m) => acc + m.value, 0);
}

function MetricCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
      <p className="text-2xl font-semibold">{typeof value === "number" ? value.toLocaleString() : value}</p>
      <p className="text-xs text-muted">{label}</p>
      {sub && <p className="mt-0.5 text-[10px] text-muted">{sub}</p>}
    </div>
  );
}

function MiniBar({ metrics, label }: { metrics: DailyMetric[]; label: string }) {
  const max = Math.max(...metrics.map((m) => m.value), 1);
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium">{label}</p>
        <p className="text-sm font-semibold">{sum(metrics).toLocaleString()}</p>
      </div>
      <div className="flex items-end gap-px h-12">
        {metrics.slice(-30).map((m, i) => (
          <div
            key={i}
            className="flex-1 bg-accent/60 rounded-t-sm min-h-[2px] transition-all hover:bg-accent"
            style={{ height: `${(m.value / max) * 100}%` }}
            title={`${m.date}: ${m.value}`}
          />
        ))}
      </div>
      <div className="flex justify-between mt-1 text-[9px] text-muted">
        <span>{metrics[0]?.date?.slice(5) || ""}</span>
        <span>{metrics[metrics.length - 1]?.date?.slice(5) || ""}</span>
      </div>
    </div>
  );
}

export function PerformanceClient({ siteId }: { siteId: string }) {
  const [data, setData] = useState<PerformanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/google/performance?site_id=${siteId}`)
      .then((r) => {
        if (!r.ok) throw new Error("No GBP connection");
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [siteId]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <EmptyState
          icon="▥"
          title="Connect Google Business Profile"
          description="Link your GBP account to see how customers find and interact with your business on Google."
        />
      </div>
    );
  }

  const totalImpressions = sum(data.searchImpressions) + sum(data.mapsImpressions);

  return (
    <div className="p-4 space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-5 gap-3">
        <MetricCard
          label="Total Impressions"
          value={totalImpressions}
          sub="Search + Maps, last 30 days"
        />
        <MetricCard
          label="Website Clicks"
          value={sum(data.websiteClicks)}
          sub="Last 30 days"
        />
        <MetricCard
          label="Phone Calls"
          value={sum(data.callClicks)}
          sub="Last 30 days"
        />
        <MetricCard
          label="Direction Requests"
          value={sum(data.directionRequests)}
          sub="Last 30 days"
        />
        <MetricCard
          label="Search Keywords"
          value={data.searchKeywords.length}
          sub="Unique terms this month"
        />
      </div>

      {/* Daily charts */}
      <div className="grid grid-cols-2 gap-3">
        <MiniBar metrics={data.searchImpressions} label="Search Impressions" />
        <MiniBar metrics={data.mapsImpressions} label="Maps Impressions" />
        <MiniBar metrics={data.websiteClicks} label="Website Clicks" />
        <MiniBar metrics={data.callClicks} label="Phone Calls" />
        <MiniBar metrics={data.directionRequests} label="Direction Requests" />
      </div>

      {/* Search keywords */}
      {data.searchKeywords.length > 0 && (
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <h3 className="text-sm font-medium mb-3">Top Search Keywords</h3>
          <p className="text-xs text-muted mb-3">What people search to find your business on Google</p>
          <div className="space-y-1">
            {data.searchKeywords.map((kw, i) => {
              const maxImpressions = data.searchKeywords[0]?.impressions || 1;
              return (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-6 text-right text-[10px] text-muted">{i + 1}</span>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs">{kw.keyword}</span>
                      <span className="text-[10px] text-muted">{kw.impressions.toLocaleString()}</span>
                    </div>
                    <div className="mt-0.5 h-1 rounded-full bg-surface-hover">
                      <div
                        className="h-full rounded-full bg-accent/50"
                        style={{ width: `${(kw.impressions / maxImpressions) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
