"use client";

interface PageScore {
  url: string;
  performance: number;
  seo: number;
  accessibility: number;
  best_practices: number;
  scored_at: string;
}

interface QueryRow {
  query: string;
  impressions: number;
  clicks: number;
  avg_position: number;
}

function scoreColor(score: number): string {
  if (score >= 90) return "text-success";
  if (score >= 50) return "text-warning";
  return "text-danger";
}

function scoreBg(score: number): string {
  if (score >= 90) return "bg-success/10";
  if (score >= 50) return "bg-warning/10";
  return "bg-danger/10";
}

function ScoreBadge({ score }: { score: number }) {
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${scoreColor(score)} ${scoreBg(score)}`}>
      {score}
    </span>
  );
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
    return path.replace(/^\//, "").replace(/\/$/, "").replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()).slice(0, 40);
  } catch {
    return url;
  }
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function SeoOverviewClient({
  siteName,
  pageScores,
  topQueries,
  contentStats,
}: {
  siteName: string;
  pageScores: PageScore[];
  topQueries: QueryRow[];
  contentStats: { total: number; active: number };
}) {
  const hasScores = pageScores.length > 0;
  const hasQueries = topQueries.length > 0;

  const avg = (key: keyof PageScore) => {
    if (!hasScores) return 0;
    return Math.round(pageScores.reduce((s, p) => s + (p[key] as number), 0) / pageScores.length);
  };

  const totalImpressions = topQueries.reduce((s, q) => s + q.impressions, 0);
  const totalClicks = topQueries.reduce((s, q) => s + q.clicks, 0);

  return (
    <div className="p-4 space-y-6">
      <div>
        <h1 className="text-lg font-semibold">SEO</h1>
        <p className="text-xs text-muted">{siteName} · site health and search visibility</p>
      </div>

      {/* Top-line metrics */}
      <div className="grid grid-cols-5 gap-3">
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card text-center">
          <p className={`text-2xl font-semibold ${hasScores ? scoreColor(avg("seo")) : ""}`}>
            {hasScores ? avg("seo") : "—"}
          </p>
          <p className="text-[10px] text-muted">SEO Score</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card text-center">
          <p className={`text-2xl font-semibold ${hasScores ? scoreColor(avg("performance")) : ""}`}>
            {hasScores ? avg("performance") : "—"}
          </p>
          <p className="text-[10px] text-muted">Performance</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card text-center">
          <p className={`text-2xl font-semibold ${hasScores ? scoreColor(avg("accessibility")) : ""}`}>
            {hasScores ? avg("accessibility") : "—"}
          </p>
          <p className="text-[10px] text-muted">Accessibility</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card text-center">
          <p className="text-2xl font-semibold text-accent">{totalClicks.toLocaleString()}</p>
          <p className="text-[10px] text-muted">Search Clicks (28d)</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card text-center">
          <p className="text-2xl font-semibold">{totalImpressions.toLocaleString()}</p>
          <p className="text-[10px] text-muted">Impressions (28d)</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Page scores */}
        <div className="rounded-xl border border-border bg-surface shadow-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-sm font-medium">Page Health</h3>
            <p className="text-[10px] text-muted">PageSpeed Insights scores</p>
          </div>
          {hasScores ? (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-[10px] text-muted">
                  <th className="px-4 py-2 text-left">Page</th>
                  <th className="px-4 py-2 text-center">Perf</th>
                  <th className="px-4 py-2 text-center">SEO</th>
                  <th className="px-4 py-2 text-center">A11y</th>
                  <th className="px-4 py-2 text-right">Scored</th>
                </tr>
              </thead>
              <tbody>
                {pageScores.map((p) => (
                  <tr key={p.url} className="border-b border-border last:border-0 hover:bg-surface-hover">
                    <td className="px-4 py-2 font-medium">{pageLabel(p.url)}</td>
                    <td className="px-4 py-2 text-center"><ScoreBadge score={p.performance} /></td>
                    <td className="px-4 py-2 text-center"><ScoreBadge score={p.seo} /></td>
                    <td className="px-4 py-2 text-center"><ScoreBadge score={p.accessibility} /></td>
                    <td className="px-4 py-2 text-right text-muted">{timeAgo(p.scored_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="px-4 py-8 text-center text-xs text-muted">
              Page scores will appear after your site is analyzed.
            </p>
          )}
        </div>

        {/* Top search queries */}
        <div className="rounded-xl border border-border bg-surface shadow-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-sm font-medium">Top Search Queries</h3>
            <p className="text-[10px] text-muted">What people search to find you</p>
          </div>
          {hasQueries ? (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-[10px] text-muted">
                  <th className="px-4 py-2 text-left">Query</th>
                  <th className="px-4 py-2 text-right">Impr.</th>
                  <th className="px-4 py-2 text-right">Clicks</th>
                  <th className="px-4 py-2 text-right">Position</th>
                </tr>
              </thead>
              <tbody>
                {topQueries.map((q) => (
                  <tr key={q.query} className="border-b border-border last:border-0 hover:bg-surface-hover">
                    <td className="px-4 py-2 truncate max-w-[180px]">{q.query}</td>
                    <td className="px-4 py-2 text-right text-muted">{q.impressions.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right font-medium">{q.clicks}</td>
                    <td className={`px-4 py-2 text-right ${positionColor(q.avg_position as number)}`}>{q.avg_position}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="px-4 py-8 text-center text-xs text-muted">
              Search data will appear after Google indexes your site. There's typically a 3-day delay.
            </p>
          )}
        </div>
      </div>

      {/* Meta content stats */}
      {contentStats.total > 0 && (
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <div className="flex items-center gap-6">
            <div>
              <span className="text-sm font-medium">{contentStats.active}</span>
              <span className="ml-1 text-xs text-muted">active meta tags</span>
            </div>
            <div>
              <span className="text-sm font-medium">{contentStats.total}</span>
              <span className="ml-1 text-xs text-muted">pages with SEO content</span>
            </div>
            <p className="text-[10px] text-muted ml-auto">
              Meta titles, descriptions, OG tags, and structured data are managed by your content team.
            </p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!hasScores && !hasQueries && contentStats.total === 0 && (
        <div className="rounded-xl border border-border bg-surface p-8 text-center shadow-card">
          <p className="text-sm font-medium">SEO data is being collected</p>
          <p className="mt-1 text-xs text-muted">
            Page scores, search performance, and meta content will appear here as your site gets indexed and analyzed.
          </p>
        </div>
      )}
    </div>
  );
}
