"use client";

import { useState, useEffect } from "react";

interface QueryRow {
  query: string;
  impressions: number;
  clicks: number;
  avgPosition: number;
  ctr: number;
}

interface PageRow {
  url: string;
  clicks: number;
  impressions: number;
  query_count: number;
}

function positionColor(pos: number): string {
  if (pos <= 3) return "text-success";
  if (pos <= 10) return "text-accent";
  if (pos <= 20) return "text-warning";
  return "text-muted";
}

function pageLabel(url: string): string {
  try {
    const path = new URL(url).pathname;
    if (path === "/" || path === "") return "Home";
    return path.replace(/^\//, "").replace(/\/$/, "").replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()).slice(0, 50);
  } catch {
    return url;
  }
}

export function SearchClient({ siteId }: { siteId: string }) {
  const [queries, setQueries] = useState<QueryRow[]>([]);
  const [pages, setPages] = useState<PageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(28);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/seo/search?site_id=${siteId}&days=${days}`)
      .then(r => r.ok ? r.json() : { queries: [], pages: [] })
      .then(data => { setQueries(data.queries || []); setPages(data.pages || []); })
      .finally(() => setLoading(false));
  }, [siteId, days]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  const totalImpressions = queries.reduce((s, q) => s + q.impressions, 0);
  const totalClicks = queries.reduce((s, q) => s + q.clicks, 0);
  const avgCtr = totalImpressions > 0 ? Math.round((totalClicks / totalImpressions) * 1000) / 10 : 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Search Performance</h1>
          <p className="text-xs text-muted">Google Search Console · what people search to find your site</p>
        </div>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="rounded border border-border bg-background px-3 py-1 text-xs"
        >
          <option value={7}>Last 7 days</option>
          <option value={28}>Last 28 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {/* Summary */}
      {queries.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          <div className="rounded-xl border border-border bg-surface p-4 shadow-card text-center">
            <p className="text-2xl font-semibold">{totalImpressions.toLocaleString()}</p>
            <p className="text-[10px] text-muted">Impressions</p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-4 shadow-card text-center">
            <p className="text-2xl font-semibold text-accent">{totalClicks.toLocaleString()}</p>
            <p className="text-[10px] text-muted">Clicks</p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-4 shadow-card text-center">
            <p className="text-2xl font-semibold">{avgCtr}%</p>
            <p className="text-[10px] text-muted">Avg CTR</p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-4 shadow-card text-center">
            <p className="text-2xl font-semibold">{queries.length}</p>
            <p className="text-[10px] text-muted">Keywords</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {/* Top queries */}
        <div className="rounded-xl border border-border bg-surface shadow-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-sm font-medium">Top Queries</h3>
          </div>
          {queries.length > 0 ? (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-[10px] text-muted">
                  <th className="px-4 py-2 text-left">Query</th>
                  <th className="px-4 py-2 text-right">Impr.</th>
                  <th className="px-4 py-2 text-right">Clicks</th>
                  <th className="px-4 py-2 text-right">Pos.</th>
                </tr>
              </thead>
              <tbody>
                {queries.slice(0, 25).map((q) => (
                  <tr key={q.query} className="border-b border-border last:border-0 hover:bg-surface-hover">
                    <td className="px-4 py-2 truncate max-w-[200px]">{q.query}</td>
                    <td className="px-4 py-2 text-right text-muted">{q.impressions.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right font-medium">{q.clicks}</td>
                    <td className={`px-4 py-2 text-right ${positionColor(q.avgPosition)}`}>{q.avgPosition}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="px-4 py-6 text-center text-xs text-muted">No search data yet.</p>
          )}
        </div>

        {/* Top pages */}
        <div className="rounded-xl border border-border bg-surface shadow-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-sm font-medium">Top Pages</h3>
          </div>
          {pages.length > 0 ? (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-[10px] text-muted">
                  <th className="px-4 py-2 text-left">Page</th>
                  <th className="px-4 py-2 text-right">Clicks</th>
                  <th className="px-4 py-2 text-right">Impr.</th>
                  <th className="px-4 py-2 text-right">Queries</th>
                </tr>
              </thead>
              <tbody>
                {pages.slice(0, 25).map((p) => (
                  <tr key={p.url} className="border-b border-border last:border-0 hover:bg-surface-hover">
                    <td className="px-4 py-2">
                      <p className="font-medium truncate max-w-[180px]">{pageLabel(p.url)}</p>
                    </td>
                    <td className="px-4 py-2 text-right font-medium">{p.clicks}</td>
                    <td className="px-4 py-2 text-right text-muted">{p.impressions.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right text-muted">{p.query_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="px-4 py-6 text-center text-xs text-muted">No page data yet.</p>
          )}
        </div>
      </div>

      {queries.length === 0 && pages.length === 0 && (
        <div className="rounded-xl border border-border bg-surface p-8 text-center shadow-card">
          <p className="text-sm font-medium">Search data is being collected</p>
          <p className="mt-1 text-xs text-muted">
            Google Search Console data appears after your site is verified and indexed. There's typically a 3-day delay.
          </p>
        </div>
      )}
    </div>
  );
}
