"use client";

import { useState, useEffect, useCallback } from "react";
import { ManagePage } from "@/components/manage/manage-page";

interface AuditItem {
  id: string;
  title: string;
  description: string;
  score: number | null;
  displayValue?: string;
}

interface PageScore {
  url: string;
  performance: number;
  seo: number;
  accessibility: number;
  best_practices: number;
  audits: AuditItem[];
  scored_at: string;
}

interface QueryRow {
  query: string;
  impressions: number;
  clicks: number;
  ctr: number;
  position: number;
  pages: string[];
}

interface PageRow {
  url: string;
  impressions: number;
  clicks: number;
  queries: number;
}

interface SiteInfo {
  customDomain: string | null;
  gscProperty: string | null;
  gscVerificationToken: string | null;
  scoreCount: number;
  searchCount: number;
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

function ScoreRing({ score, label }: { score: number; label: string }) {
  const color = score >= 90 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#ef4444";
  const circumference = 2 * Math.PI * 36;
  const offset = circumference - (score / 100) * circumference;
  return (
    <div className="flex flex-col items-center">
      <svg width="88" height="88" className="-rotate-90">
        <circle cx="44" cy="44" r="36" fill="none" stroke="currentColor" strokeWidth="6" className="text-border" />
        <circle cx="44" cy="44" r="36" fill="none" stroke={color} strokeWidth="6"
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" />
      </svg>
      <span className={`-mt-14 text-lg font-semibold ${scoreColor(score)}`}>{score}</span>
      <span className="mt-6 text-[10px] text-muted">{label}</span>
    </div>
  );
}

function pageLabel(url: string): string {
  try {
    const path = new URL(url).pathname;
    if (path === "/" || path === "") return "Home";
    return path.replace(/^\//, "").replace(/\/$/, "").replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()).slice(0, 40);
  } catch { return url; }
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function positionColor(pos: number): string {
  if (pos <= 3) return "text-success";
  if (pos <= 10) return "text-accent";
  if (pos <= 20) return "text-warning";
  return "text-muted";
}

type Tab = "scores" | "search" | "verification";

function SeoContent({ siteId }: { siteId: string }) {
  const [siteInfo, setSiteInfo] = useState<SiteInfo | null>(null);
  const [tab, setTab] = useState<Tab>("scores");
  const [scores, setScores] = useState<PageScore[]>([]);
  const [queries, setQueries] = useState<QueryRow[]>([]);
  const [pages, setPages] = useState<PageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [scoring, setScoring] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setExpanded(null);
    setScoring(null);
    setVerifyResult(null);
    setSyncResult(null);

    Promise.all([
      fetch(`/api/admin/sites/${siteId}/page-scores`).then(r => r.ok ? r.json() : { scores: [] }),
      fetch(`/api/admin/sites/${siteId}/search-console`).then(r => r.ok ? r.json() : { queries: [], pages: [] }),
      fetch(`/api/manage/seo-info?site_id=${siteId}`).then(r => r.ok ? r.json() : null),
    ])
      .then(([scoreData, searchData, info]) => {
        setScores(scoreData.scores || []);
        setQueries(searchData.queries || []);
        setPages(searchData.pages || []);
        setSiteInfo(info);
      })
      .finally(() => setLoading(false));
  }, [siteId]);

  useEffect(() => { load(); }, [load]);

  async function scoreAll() {
    setScoring("all");
    try {
      await fetch(`/api/admin/sites/${siteId}/page-scores`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "score_all" }),
      });
      const fresh = await fetch(`/api/admin/sites/${siteId}/page-scores`);
      const data = await fresh.json();
      setScores(data.scores || []);
    } catch { /* ignore */ }
    setScoring(null);
  }

  async function scoreOne(url: string) {
    setScoring(url);
    try {
      await fetch(`/api/admin/sites/${siteId}/page-scores`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const fresh = await fetch(`/api/admin/sites/${siteId}/page-scores`);
      const data = await fresh.json();
      setScores(data.scores || []);
    } catch { /* ignore */ }
    setScoring(null);
  }

  async function verifySite() {
    setVerifyResult(null);
    setScoring("verify");
    try {
      const res = await fetch(`/api/admin/sites/${siteId}/search-console`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify" }),
      });
      const data = await res.json();
      if (data.status === "verified") {
        setVerifyResult("Verified — Search Console property created");
      } else if (data.status === "token_stored") {
        setVerifyResult("Verification token stored. Site needs to serve the meta tag first — try again after next deploy.");
      } else {
        setVerifyResult(data.error || "Verification failed");
      }
    } catch { setVerifyResult("Request failed"); }
    setScoring(null);
  }

  async function syncSearchData() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch(`/api/admin/sites/${siteId}/search-console`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync", days: 28 }),
      });
      const data = await res.json();
      setSyncResult(data.success ? `${data.stored} rows synced` : (data.error || "Sync failed"));
      if (data.success) {
        const fresh = await fetch(`/api/admin/sites/${siteId}/search-console`);
        const d = await fresh.json();
        setQueries(d.queries || []);
        setPages(d.pages || []);
      }
    } catch { setSyncResult("Request failed"); }
    setSyncing(false);
  }

  const avgScore = (key: keyof PageScore) => {
    if (scores.length === 0) return 0;
    return Math.round(scores.reduce((s, p) => s + (p[key] as number), 0) / scores.length);
  };

  const TABS: { key: Tab; label: string }[] = [
    { key: "scores", label: "Page Scores" },
    { key: "search", label: "Search Console" },
    { key: "verification", label: "Verification" },
  ];

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      {/* Status badges */}
      {siteInfo && (
        <div className="flex items-center gap-3 text-[10px]">
          <span className="rounded bg-surface-hover px-2 py-1 text-muted">
            {siteInfo.customDomain || "No custom domain"}
          </span>
          <span className={`rounded px-2 py-1 ${siteInfo.gscProperty ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
            {siteInfo.gscProperty ? "Search Console verified" : "Search Console not verified"}
          </span>
          <span className="rounded bg-surface-hover px-2 py-1 text-muted">
            {siteInfo.scoreCount} pages scored
          </span>
          <span className="rounded bg-surface-hover px-2 py-1 text-muted">
            {siteInfo.searchCount} search rows
          </span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm transition-colors ${
              tab === t.key ? "border-b-2 border-accent text-accent" : "text-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* === SCORES TAB === */}
      {tab === "scores" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted">{scores.length} pages scored</p>
            <button
              onClick={scoreAll}
              disabled={scoring !== null}
              className="rounded bg-accent px-4 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {scoring === "all" ? "Scoring (~60s)..." : "Score All Pages"}
            </button>
          </div>

          {scores.length > 0 && (
            <div className="rounded-xl border border-border bg-surface p-6 shadow-card">
              <div className="flex justify-around">
                <ScoreRing score={avgScore("performance")} label="Performance" />
                <ScoreRing score={avgScore("seo")} label="SEO" />
                <ScoreRing score={avgScore("accessibility")} label="Accessibility" />
                <ScoreRing score={avgScore("best_practices")} label="Best Practices" />
              </div>
            </div>
          )}

          {scores.length > 0 ? (
            <div className="rounded-xl border border-border bg-surface shadow-card overflow-hidden">
              <div className="divide-y divide-border">
                {scores.map((page) => {
                  const isExpanded = expanded === page.url;
                  const audits = (page.audits || []) as AuditItem[];
                  const failCount = audits.filter(a => a.score !== null && a.score < 0.5).length;
                  return (
                    <div key={page.url}>
                      <div
                        onClick={() => setExpanded(isExpanded ? null : page.url)}
                        className={`flex items-center gap-4 px-4 py-3 cursor-pointer transition-colors hover:bg-surface-hover ${isExpanded ? "bg-surface-hover" : ""}`}
                      >
                        <span className={`text-[9px] text-muted w-3 transition-transform ${isExpanded ? "rotate-90" : ""}`}>
                          {audits.length > 0 ? "▶" : " "}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium">{pageLabel(page.url)}</p>
                          <p className="text-[10px] text-muted truncate">{page.url}</p>
                        </div>
                        <ScoreBadge score={page.performance} />
                        <ScoreBadge score={page.seo} />
                        <ScoreBadge score={page.accessibility} />
                        <ScoreBadge score={page.best_practices} />
                        {failCount > 0 && (
                          <span className="rounded bg-danger/10 px-1.5 py-0.5 text-[9px] text-danger">{failCount}</span>
                        )}
                        <span className="text-[10px] text-muted w-12 text-right">{timeAgo(page.scored_at)}</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); scoreOne(page.url); }}
                          disabled={scoring !== null}
                          className="text-[10px] text-accent hover:underline disabled:opacity-50"
                        >
                          {scoring === page.url ? "..." : "Rescore"}
                        </button>
                      </div>
                      {isExpanded && audits.length > 0 && (
                        <div className="bg-black/20 border-t border-border px-8 py-3 space-y-2">
                          <p className="text-[10px] text-muted">Failing audits ({audits.length})</p>
                          {audits.map((a) => {
                            const sev = a.score === 0 ? "high" : (a.score !== null && a.score < 0.5) ? "medium" : "low";
                            const sevColor = sev === "high" ? "text-danger" : sev === "medium" ? "text-warning" : "text-muted";
                            const sevBg = sev === "high" ? "bg-danger/10" : sev === "medium" ? "bg-warning/10" : "bg-surface-hover";
                            return (
                              <div key={a.id} className="flex items-start gap-2">
                                <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium ${sevColor} ${sevBg}`}>{sev}</span>
                                <div className="min-w-0">
                                  <p className="text-xs font-medium">{a.title}</p>
                                  {a.displayValue && <p className="text-[10px] text-muted">{a.displayValue}</p>}
                                  <p className="text-[10px] text-muted mt-0.5 line-clamp-2">{a.description.replace(/\[.*?\]\(.*?\)/g, "").trim()}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-surface p-8 text-center shadow-card">
              <p className="text-sm font-medium">No pages scored yet</p>
              <p className="mt-1 text-xs text-muted">Click &quot;Score All Pages&quot; to run PageSpeed Insights.</p>
            </div>
          )}
        </div>
      )}

      {/* === SEARCH TAB === */}
      {tab === "search" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted">{queries.length} queries · {pages.length} pages</p>
            <div className="flex items-center gap-2">
              {syncResult && <span className="text-[10px] text-success">{syncResult}</span>}
              <button
                onClick={syncSearchData}
                disabled={syncing || !siteInfo?.gscProperty}
                className="rounded bg-accent px-4 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                title={!siteInfo?.gscProperty ? "Verify Search Console first" : ""}
              >
                {syncing ? "Syncing..." : "Sync Search Data"}
              </button>
            </div>
          </div>

          {!siteInfo?.gscProperty && (
            <div className="rounded-xl border border-warning/30 bg-warning/5 p-4">
              <p className="text-xs text-warning font-medium">Search Console not verified</p>
              <p className="text-[10px] text-muted mt-1">Go to the Verification tab to set up Search Console for this site.</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
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
                    {queries.slice(0, 20).map(q => (
                      <tr key={q.query} className="border-b border-border last:border-0 hover:bg-surface-hover">
                        <td className="px-4 py-2 truncate max-w-[180px]">{q.query}</td>
                        <td className="px-4 py-2 text-right text-muted">{q.impressions.toLocaleString()}</td>
                        <td className="px-4 py-2 text-right font-medium">{q.clicks}</td>
                        <td className={`px-4 py-2 text-right ${positionColor(q.position)}`}>{q.position}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="px-4 py-8 text-center text-xs text-muted">No query data. Sync after verification.</p>
              )}
            </div>

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
                    {pages.slice(0, 20).map(p => (
                      <tr key={p.url} className="border-b border-border last:border-0 hover:bg-surface-hover">
                        <td className="px-4 py-2 font-medium truncate max-w-[180px]">{pageLabel(p.url)}</td>
                        <td className="px-4 py-2 text-right font-medium">{p.clicks}</td>
                        <td className="px-4 py-2 text-right text-muted">{p.impressions.toLocaleString()}</td>
                        <td className="px-4 py-2 text-right text-muted">{p.queries}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="px-4 py-8 text-center text-xs text-muted">No page data. Sync after verification.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* === VERIFICATION TAB === */}
      {tab === "verification" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
              <h3 className="text-sm font-medium mb-3">Search Console Status</h3>
              <div className="space-y-2">
                <div className="flex items-baseline justify-between py-1.5 border-b border-border">
                  <span className="text-[10px] text-muted">Custom Domain</span>
                  <span className="text-xs font-medium">{siteInfo?.customDomain || "—"}</span>
                </div>
                <div className="flex items-baseline justify-between py-1.5 border-b border-border">
                  <span className="text-[10px] text-muted">GSC Property</span>
                  <span className="text-xs font-medium">{siteInfo?.gscProperty || "Not set"}</span>
                </div>
                <div className="flex items-baseline justify-between py-1.5 border-b border-border">
                  <span className="text-[10px] text-muted">Meta Tag</span>
                  <span className={`text-xs font-medium ${siteInfo?.gscVerificationToken ? "text-success" : "text-muted"}`}>
                    {siteInfo?.gscVerificationToken ? "Injected" : "Not set"}
                  </span>
                </div>
                <div className="flex items-baseline justify-between py-1.5">
                  <span className="text-[10px] text-muted">Status</span>
                  <span className={`text-xs font-medium ${siteInfo?.gscProperty ? "text-success" : "text-warning"}`}>
                    {siteInfo?.gscProperty ? "Verified" : "Pending"}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
              <h3 className="text-sm font-medium mb-3">Actions</h3>
              <div className="space-y-3">
                <div>
                  <p className="text-[10px] text-muted mb-2">
                    Request a verification token from Google, inject it into the site&apos;s meta tags, then verify ownership. Requires an active GBP connection and a custom domain.
                  </p>
                  <button
                    onClick={verifySite}
                    disabled={scoring !== null || !siteInfo?.customDomain}
                    className="rounded bg-accent px-4 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                  >
                    {scoring === "verify" ? "Verifying..." : siteInfo?.gscProperty ? "Re-verify" : "Verify Domain"}
                  </button>
                </div>

                {verifyResult && (
                  <div className={`rounded-lg p-3 text-xs ${
                    verifyResult.includes("Verified") ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
                  }`}>
                    {verifyResult}
                  </div>
                )}

                {!siteInfo?.customDomain && (
                  <p className="text-[10px] text-warning">No custom domain configured. Provision one in Site Settings → Website first.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <ManagePage title="SEO" requireSite>
      {({ siteId }) => <SeoContent siteId={siteId} />}
    </ManagePage>
  );
}
