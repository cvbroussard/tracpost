"use client";

import { useState } from "react";

interface PageScore {
  url: string;
  performance: number;
  seo: number;
  accessibility: number;
  best_practices: number;
  scored_at: string;
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

function pageLabel(url: string): string {
  try {
    const path = new URL(url).pathname;
    if (path === "/" || path === "") return "Home";
    return path.replace(/^\//, "").replace(/\/$/, "").replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  } catch {
    return url;
  }
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function ScoresClient({
  siteId,
  siteName,
  scores: initialScores,
}: {
  siteId: string;
  siteName: string;
  scores: PageScore[];
}) {
  const [scores, setScores] = useState(initialScores);
  const [loading, setLoading] = useState(false);

  const avgScore = (key: keyof PageScore) => {
    if (scores.length === 0) return 0;
    return Math.round(scores.reduce((s, p) => s + (p[key] as number), 0) / scores.length);
  };

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Page Scores</h1>
          <p className="text-xs text-muted">{siteName} · Google PageSpeed Insights</p>
        </div>
      </div>

      {/* Summary cards */}
      {scores.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          <div className="rounded-xl border border-border bg-surface p-4 shadow-card text-center">
            <p className={`text-2xl font-semibold ${scoreColor(avgScore("performance"))}`}>{avgScore("performance")}</p>
            <p className="text-[10px] text-muted">Performance</p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-4 shadow-card text-center">
            <p className={`text-2xl font-semibold ${scoreColor(avgScore("seo"))}`}>{avgScore("seo")}</p>
            <p className="text-[10px] text-muted">SEO</p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-4 shadow-card text-center">
            <p className={`text-2xl font-semibold ${scoreColor(avgScore("accessibility"))}`}>{avgScore("accessibility")}</p>
            <p className="text-[10px] text-muted">Accessibility</p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-4 shadow-card text-center">
            <p className={`text-2xl font-semibold ${scoreColor(avgScore("best_practices"))}`}>{avgScore("best_practices")}</p>
            <p className="text-[10px] text-muted">Best Practices</p>
          </div>
        </div>
      )}

      {/* Page list */}
      {scores.length > 0 ? (
        <div className="rounded-xl border border-border bg-surface shadow-card overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-[10px] text-muted">
                <th className="px-4 py-2.5 text-left">Page</th>
                <th className="px-4 py-2.5 text-center">Performance</th>
                <th className="px-4 py-2.5 text-center">SEO</th>
                <th className="px-4 py-2.5 text-center">Accessibility</th>
                <th className="px-4 py-2.5 text-center">Best Practices</th>
                <th className="px-4 py-2.5 text-right">Scored</th>
              </tr>
            </thead>
            <tbody>
              {scores.map((page) => (
                <tr key={page.url} className="border-b border-border last:border-0 hover:bg-surface-hover">
                  <td className="px-4 py-2.5">
                    <p className="font-medium">{pageLabel(page.url)}</p>
                    <p className="text-[10px] text-muted truncate max-w-[250px]">{page.url}</p>
                  </td>
                  <td className="px-4 py-2.5 text-center"><ScoreBadge score={page.performance} /></td>
                  <td className="px-4 py-2.5 text-center"><ScoreBadge score={page.seo} /></td>
                  <td className="px-4 py-2.5 text-center"><ScoreBadge score={page.accessibility} /></td>
                  <td className="px-4 py-2.5 text-center"><ScoreBadge score={page.best_practices} /></td>
                  <td className="px-4 py-2.5 text-right text-muted">{timeAgo(page.scored_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface p-8 text-center shadow-card">
          <p className="text-sm font-medium">No scores yet</p>
          <p className="mt-1 text-xs text-muted">
            Your platform operator will run page scoring to measure performance, SEO, and accessibility.
          </p>
        </div>
      )}
    </div>
  );
}
