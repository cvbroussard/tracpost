"use client";

import { useState } from "react";
import type { AuditData, IssueRow, PageAuditRow } from "./page";

interface LatestAudit {
  id: string;
  overallScore: number;
  url: string;
  auditData: AuditData;
  issues: IssueRow[];
  createdAt: string;
}

interface Props {
  siteId: string;
  siteName: string;
  siteUrl: string;
  latestAudit: LatestAudit | null;
  pageAudits: PageAuditRow[];
}

export function MonitoringClient({
  siteId,
  siteName,
  siteUrl,
  latestAudit: initialAudit,
  pageAudits: initialPageAudits,
}: Props) {
  const [audit, setAudit] = useState(initialAudit);
  const [pageAudits, setPageAudits] = useState(initialPageAudits);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"issues" | "pages" | "cwv">("issues");

  async function runAudit() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/seo/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `Failed: ${res.status}`);
      }

      // Refresh: fetch latest audit
      const getRes = await fetch(`/api/seo/audit?siteId=${siteId}`);
      if (getRes.ok) {
        const data = await getRes.json();
        if (data.audit) {
          setAudit(data.audit);
          setPageAudits(
            data.pages.map(
              (p: {
                pageType: string;
                url: string;
                score: number;
                issues: IssueRow[];
                auditData: Record<string, unknown>;
              }) => ({
                page_type: p.pageType,
                url: p.url,
                seo_score: p.score,
                issues: p.issues,
                audit_data: p.auditData,
                created_at: data.audit.createdAt,
              })
            )
          );
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Audit failed");
    } finally {
      setRunning(false);
    }
  }

  const issues = audit?.issues || [];
  const critical = issues.filter((i) => i.severity === "critical");
  const warnings = issues.filter((i) => i.severity === "warning");
  const info = issues.filter((i) => i.severity === "info");
  const cwv = audit?.auditData?.cwvSummary;

  return (
    <div className="space-y-6">
      {/* Header with Run Audit button */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted">
            {siteName}
            {siteUrl && ` — ${siteUrl}`}
          </p>
          {audit && (
            <p className="mt-0.5 text-xs text-muted">
              Last audit:{" "}
              {new Date(audit.createdAt).toLocaleString()}
            </p>
          )}
        </div>
        <button
          onClick={runAudit}
          disabled={running}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {running ? "Running..." : "Run Audit"}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      {/* Overall Score + Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-lg border border-border bg-surface p-4 text-center">
          <p
            className={`text-3xl font-bold ${
              !audit
                ? "text-muted"
                : audit.overallScore >= 80
                  ? "text-success"
                  : audit.overallScore >= 50
                    ? "text-warning"
                    : "text-danger"
            }`}
          >
            {audit ? audit.overallScore : "—"}
          </p>
          <p className="text-xs text-muted">Health Score</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4 text-center">
          <p className="text-3xl font-bold text-danger">
            {critical.length}
          </p>
          <p className="text-xs text-muted">Critical</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4 text-center">
          <p className="text-3xl font-bold text-warning">
            {warnings.length}
          </p>
          <p className="text-xs text-muted">Warnings</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4 text-center">
          <p className="text-3xl font-bold">
            {audit?.auditData?.totalPages ?? "—"}
          </p>
          <p className="text-xs text-muted">Pages</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border border-border bg-surface p-1">
        {(["issues", "pages", "cwv"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === t
                ? "bg-accent/10 text-accent"
                : "text-muted hover:text-foreground"
            }`}
          >
            {t === "issues"
              ? `Issues (${issues.length})`
              : t === "pages"
                ? `Pages (${pageAudits.length})`
                : "Core Web Vitals"}
          </button>
        ))}
      </div>

      {/* Issues tab */}
      {tab === "issues" && (
        <section className="space-y-4">
          {!audit ? (
            <EmptyState message="Run an audit to see issues." />
          ) : issues.length === 0 ? (
            <div className="rounded-lg border border-success/30 bg-success/5 p-6 text-center">
              <p className="text-sm font-medium text-success">
                No issues found
              </p>
              <p className="mt-1 text-xs text-muted">
                Your site looks great!
              </p>
            </div>
          ) : (
            <>
              {critical.length > 0 && (
                <IssueGroup
                  label="Critical"
                  issues={critical}
                  color="danger"
                />
              )}
              {warnings.length > 0 && (
                <IssueGroup
                  label="Warnings"
                  issues={warnings}
                  color="warning"
                />
              )}
              {info.length > 0 && (
                <IssueGroup label="Info" issues={info} color="muted" />
              )}
            </>
          )}
        </section>
      )}

      {/* Pages tab */}
      {tab === "pages" && (
        <section className="rounded-lg border border-border bg-surface">
          {pageAudits.length > 0 ? (
            <div className="divide-y divide-border">
              {pageAudits.map((page, i) => (
                <div
                  key={`${page.url}-${i}`}
                  className="flex items-center justify-between px-5 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">
                      {page.url || "Unknown URL"}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {page.page_type || "unknown"}
                      {page.issues && Array.isArray(page.issues)
                        ? ` — ${page.issues.length} issue(s)`
                        : ""}
                    </p>
                  </div>
                  <ScoreBadge score={page.seo_score} />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState message="Run an audit to see page results." />
          )}
        </section>
      )}

      {/* CWV tab */}
      {tab === "cwv" && (
        <section className="space-y-4">
          {!cwv ? (
            <EmptyState message="Core Web Vitals data will appear after running an audit. Requires PAGESPEED_API_KEY." />
          ) : cwv.error ? (
            <div className="rounded-lg border border-warning/30 bg-warning/5 p-4 text-sm text-warning">
              {cwv.error}
            </div>
          ) : (
            <>
              {/* Performance score */}
              {cwv.performanceScore !== null && (
                <div className="rounded-lg border border-border bg-surface p-4 text-center">
                  <p
                    className={`text-3xl font-bold ${
                      cwv.performanceScore >= 90
                        ? "text-success"
                        : cwv.performanceScore >= 50
                          ? "text-warning"
                          : "text-danger"
                    }`}
                  >
                    {cwv.performanceScore}
                  </p>
                  <p className="text-xs text-muted">
                    Lighthouse Performance Score
                  </p>
                </div>
              )}

              {/* Metric cards */}
              <div className="grid grid-cols-2 gap-4">
                <CwvCard
                  label="LCP"
                  description="Largest Contentful Paint"
                  metric={cwv.lcp}
                  format="ms"
                />
                <CwvCard
                  label="INP"
                  description="Interaction to Next Paint"
                  metric={cwv.inp}
                  format="ms"
                />
                <CwvCard
                  label="CLS"
                  description="Cumulative Layout Shift"
                  metric={cwv.cls}
                  format="score"
                />
                <CwvCard
                  label="FCP"
                  description="First Contentful Paint"
                  metric={cwv.fcp}
                  format="ms"
                />
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────

function IssueGroup({
  label,
  issues,
  color,
}: {
  label: string;
  issues: IssueRow[];
  color: string;
}) {
  return (
    <div>
      <h3 className={`mb-2 text-xs font-semibold uppercase text-${color}`}>
        {label} ({issues.length})
      </h3>
      <div className="rounded-lg border border-border bg-surface divide-y divide-border">
        {issues.map((issue, i) => (
          <div key={`${issue.url}-${issue.category}-${i}`} className="px-5 py-3">
            <p className="text-sm">{issue.message}</p>
            <p className="mt-0.5 truncate text-xs text-muted">
              {issue.url}
              <span className="ml-2 rounded bg-background px-1.5 py-0.5 text-[10px]">
                {issue.category.replace(/_/g, " ")}
              </span>
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function CwvCard({
  label,
  description,
  metric,
  format,
}: {
  label: string;
  description: string;
  metric: { value: number; unit: string; status: string } | null;
  format: "ms" | "score";
}) {
  if (!metric) {
    return (
      <div className="rounded-lg border border-border bg-surface p-4">
        <p className="text-xs font-semibold">{label}</p>
        <p className="text-xs text-muted">{description}</p>
        <p className="mt-2 text-lg text-muted">N/A</p>
      </div>
    );
  }

  const statusColor =
    metric.status === "good"
      ? "text-success"
      : metric.status === "needs_improvement"
        ? "text-warning"
        : "text-danger";

  const displayValue =
    format === "ms"
      ? `${(metric.value / 1000).toFixed(2)}s`
      : metric.value.toFixed(3);

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-xs font-semibold">{label}</p>
      <p className="text-xs text-muted">{description}</p>
      <p className={`mt-2 text-lg font-semibold ${statusColor}`}>
        {displayValue}
      </p>
      <p className={`text-xs ${statusColor}`}>
        {metric.status.replace(/_/g, " ")}
      </p>
    </div>
  );
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return null;
  const color =
    score >= 80
      ? "bg-success/10 text-success"
      : score >= 50
        ? "bg-warning/10 text-warning"
        : "bg-danger/10 text-danger";
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${color}`}>
      {score}
    </span>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface">
      <p className="px-5 py-12 text-center text-sm text-muted">{message}</p>
    </div>
  );
}
