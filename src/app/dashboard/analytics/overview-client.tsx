"use client";

import { useState, useEffect } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell,
} from "recharts";

interface OverviewData {
  totalUsers: number;
  newUsers: number;
  sessions: number;
  pageViews: number;
  avgSessionDuration: number;
  bounceRate: number;
}

interface TrendPoint {
  date: string;
  users: number;
  sessions: number;
  pageViews: number;
}

interface AcquisitionChannel {
  channel: string;
  users: number;
  sessions: number;
  newUsers: number;
}

interface Attribution {
  totalFromTracPost: number;
  byMedium: Array<{ medium: string; users: number }>;
}

interface GbpPerformance {
  websiteClicks: Array<{ date: string; value: number }>;
  callClicks: Array<{ date: string; value: number }>;
  directionRequests: Array<{ date: string; value: number }>;
  searchImpressions: Array<{ date: string; value: number }>;
  mapsImpressions: Array<{ date: string; value: number }>;
  searchKeywords: Array<{ keyword: string; impressions: number }>;
}

const CHANNEL_COLORS: Record<string, string> = {
  "Organic Search": "#22c55e",
  "Direct": "#3b82f6",
  "Paid Search": "#f59e0b",
  "Referral": "#8b5cf6",
  "Organic Social": "#ec4899",
  "Cross-network": "#06b6d4",
  "Unassigned": "#94a3b8",
};

function MetricCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
      <p className="text-2xl font-semibold">{typeof value === "number" ? value.toLocaleString() : value}</p>
      <p className="text-xs text-muted">{label}</p>
      {sub && <p className="mt-0.5 text-[10px] text-muted">{sub}</p>}
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs}s`;
}

export function OverviewClient({ siteId }: { siteId: string }) {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [trend, setTrend] = useState<TrendPoint[] | null>(null);
  const [acquisition, setAcquisition] = useState<AcquisitionChannel[] | null>(null);
  const [attribution, setAttribution] = useState<Attribution | null>(null);
  const [gbp, setGbp] = useState<GbpPerformance | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/analytics?site_id=${siteId}&report=overview&days=${days}`).then(r => r.ok ? r.json() : null),
      fetch(`/api/analytics?site_id=${siteId}&report=trend&days=${days}`).then(r => r.ok ? r.json() : null),
      fetch(`/api/analytics?site_id=${siteId}&report=acquisition&days=${days}`).then(r => r.ok ? r.json() : null),
      fetch(`/api/analytics?site_id=${siteId}&report=attribution&days=${days}`).then(r => r.ok ? r.json() : null),
      fetch(`/api/google/performance?site_id=${siteId}`).then(r => r.ok ? r.json() : null),
    ])
      .then(([ov, tr, acq, attr, gbpData]) => {
        setOverview(ov);
        setTrend(tr);
        setAcquisition(acq);
        setAttribution(attr);
        setGbp(gbpData);
      })
      .finally(() => setLoading(false));
  }, [siteId, days]);

  const sum = (arr: Array<{ value: number }> | undefined) => (arr || []).reduce((s, v) => s + v.value, 0);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      {/* Date range selector */}
      <div className="flex justify-end">
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="rounded border border-border bg-background px-3 py-1 text-xs"
        >
          <option value={7}>Last 7 days</option>
          <option value={14}>Last 14 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {/* Row 1: How people find you */}
      <div>
        <h2 className="text-sm font-medium text-muted mb-3">How People Find You</h2>
        <div className="grid grid-cols-5 gap-3">
          <MetricCard label="Google Listing Views" value={sum(gbp?.searchImpressions) + sum(gbp?.mapsImpressions)} sub="Search + Maps" />
          <MetricCard label="Website Visitors" value={overview?.totalUsers || 0} sub={`${overview?.newUsers || 0} new`} />
          <MetricCard label="From TracPost" value={attribution?.totalFromTracPost || 0} sub="Content-driven traffic" />
          <MetricCard label="Page Views" value={overview?.pageViews || 0} />
          <MetricCard label="Avg. Time on Site" value={formatDuration(overview?.avgSessionDuration || 0)} />
        </div>
      </div>

      {/* Row 2: What they do */}
      <div>
        <h2 className="text-sm font-medium text-muted mb-3">What They Do</h2>
        <div className="grid grid-cols-4 gap-3">
          <MetricCard label="Phone Calls" value={sum(gbp?.callClicks)} sub="From Google listing" />
          <MetricCard label="Direction Requests" value={sum(gbp?.directionRequests)} sub="From Google listing" />
          <MetricCard label="Website Clicks" value={sum(gbp?.websiteClicks)} sub="From Google listing" />
          <MetricCard label="Sessions" value={overview?.sessions || 0} sub={`${Math.round((1 - (overview?.bounceRate || 0)) * 100)}% engaged`} />
        </div>
      </div>

      {/* Traffic trend chart */}
      {trend && trend.length > 0 && (
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <h3 className="text-sm font-medium mb-4">Traffic Trend</h3>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={trend}>
              <defs>
                <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorSessions" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tickFormatter={(d) => d.slice(5)}
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: "#1a1a1a", border: "none", borderRadius: 8, fontSize: 12, color: "#fff" }}
                labelFormatter={(d) => d}
              />
              <Area type="monotone" dataKey="users" stroke="#3b82f6" fill="url(#colorUsers)" strokeWidth={2} name="Users" />
              <Area type="monotone" dataKey="sessions" stroke="#22c55e" fill="url(#colorSessions)" strokeWidth={2} name="Sessions" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Two-column: Acquisition + Top Keywords */}
      <div className="grid grid-cols-2 gap-4">
        {/* Acquisition channels */}
        {acquisition && acquisition.length > 0 && (
          <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
            <h3 className="text-sm font-medium mb-4">Traffic Sources</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={acquisition} layout="vertical">
                <XAxis type="number" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="channel" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={120} />
                <Tooltip
                  contentStyle={{ background: "#1a1a1a", border: "none", borderRadius: 8, fontSize: 12, color: "#fff" }}
                />
                <Bar dataKey="users" name="Users" radius={[0, 4, 4, 0]}>
                  {acquisition.map((entry, index) => (
                    <Cell key={index} fill={CHANNEL_COLORS[entry.channel] || "#94a3b8"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Top search keywords */}
        {gbp?.searchKeywords && gbp.searchKeywords.length > 0 && (
          <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
            <h3 className="text-sm font-medium mb-3">Top Search Keywords</h3>
            <p className="text-xs text-muted mb-3">What people search to find your business on Google</p>
            <div className="space-y-1.5">
              {gbp.searchKeywords.slice(0, 8).map((kw, i) => {
                const maxImp = gbp.searchKeywords[0]?.impressions || 1;
                return (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-4 text-right text-[10px] text-muted">{i + 1}</span>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs">{kw.keyword}</span>
                        <span className="text-[10px] text-muted">{kw.impressions.toLocaleString()}</span>
                      </div>
                      <div className="mt-0.5 h-1 rounded-full bg-surface-hover">
                        <div
                          className="h-full rounded-full bg-accent/50"
                          style={{ width: `${(kw.impressions / maxImp) * 100}%` }}
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

      {/* TracPost attribution breakdown */}
      {attribution && attribution.byMedium.length > 0 && (
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <h3 className="text-sm font-medium mb-3">TracPost Content Performance</h3>
          <p className="text-xs text-muted mb-3">{attribution.totalFromTracPost} visitors came from TracPost-published content</p>
          <div className="flex gap-4">
            {attribution.byMedium.map((m) => (
              <div key={m.medium} className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-accent" />
                <span className="text-xs capitalize">{m.medium}</span>
                <span className="text-xs font-medium">{m.users}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No data state */}
      {!overview && !gbp && (
        <div className="rounded-xl border border-border bg-surface p-8 text-center shadow-card">
          <p className="text-sm font-medium">Analytics are being collected</p>
          <p className="mt-1 text-xs text-muted">
            GA4 data takes 24-48 hours to start reporting. GBP performance data appears after your listing is connected.
          </p>
        </div>
      )}
    </div>
  );
}
