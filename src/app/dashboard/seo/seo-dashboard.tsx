"use client";

import { useState } from "react";
import type { AuditRow, ContentRow } from "./page";

interface Props {
  siteId: string;
  siteName: string;
  siteUrl: string;
  audits: AuditRow[];
  content: ContentRow[];
}

export function SeoDashboardClient({
  siteId,
  siteName,
  siteUrl,
  audits,
  content,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<"install" | "audits" | "content">("install");

  const scriptTag = `<script src="https://cdn.tracpost.com/seo.js" data-site="${siteId}" data-key="YOUR_API_KEY"></script>`;

  function handleCopy() {
    navigator.clipboard.writeText(scriptTag).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // Compute aggregate stats
  const totalAudits = audits.length;
  const avgScore =
    totalAudits > 0
      ? Math.round(
          audits.reduce((sum, a) => sum + (a.seo_score ?? 0), 0) / totalAudits
        )
      : 0;
  const pagesWithSchema = content.filter(
    (c) =>
      c.structured_data &&
      Array.isArray(c.structured_data) &&
      (c.structured_data as unknown[]).length > 0
  ).length;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-border bg-surface p-4 text-center">
          <p className="text-2xl font-semibold">{totalAudits}</p>
          <p className="text-xs text-muted">Pages Analyzed</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4 text-center">
          <p
            className={`text-2xl font-semibold ${
              avgScore >= 80
                ? "text-success"
                : avgScore >= 50
                  ? "text-warning"
                  : "text-danger"
            }`}
          >
            {totalAudits > 0 ? avgScore : "—"}
          </p>
          <p className="text-xs text-muted">Avg SEO Score</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4 text-center">
          <p className="text-2xl font-semibold">{pagesWithSchema}</p>
          <p className="text-xs text-muted">Pages with Schema</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border border-border bg-surface p-1">
        {(["install", "audits", "content"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === t
                ? "bg-accent/10 text-accent"
                : "text-muted hover:text-foreground"
            }`}
          >
            {t === "install"
              ? "Install"
              : t === "audits"
                ? `Audits (${totalAudits})`
                : `Content (${content.length})`}
          </button>
        ))}
      </div>

      {/* Install tab */}
      {tab === "install" && (
        <section className="rounded-lg border border-border bg-surface p-5">
          <h2 className="mb-2 text-sm font-medium">Script Tag</h2>
          <p className="mb-4 text-xs text-muted">
            Add this script tag to your website&apos;s{" "}
            <code className="rounded bg-background px-1 py-0.5">
              &lt;head&gt;
            </code>{" "}
            section. Replace{" "}
            <code className="rounded bg-background px-1 py-0.5">
              YOUR_API_KEY
            </code>{" "}
            with your API key from Settings.
          </p>

          <div className="group relative">
            <pre className="overflow-x-auto rounded border border-border bg-background p-3 text-xs">
              <code>{scriptTag}</code>
            </pre>
            <button
              onClick={handleCopy}
              className="absolute right-2 top-2 rounded bg-surface px-2 py-1 text-[10px] text-muted opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>

          <div className="mt-4 space-y-2 text-xs text-muted">
            <p>
              <strong className="text-foreground">Site:</strong> {siteName}
              {siteUrl && ` (${siteUrl})`}
            </p>
            <p>
              <strong className="text-foreground">How it works:</strong> The
              script fetches your page&apos;s SEO analysis from TracPost and
              injects any missing meta tags, Open Graph tags, canonical URLs, and
              JSON-LD structured data. It never overwrites existing elements.
            </p>
            <p>
              <strong className="text-foreground">Performance:</strong>{" "}
              Lightweight (~2KB), async, cached for 1 hour. No impact on page
              load speed.
            </p>
          </div>
        </section>
      )}

      {/* Audits tab */}
      {tab === "audits" && (
        <section className="rounded-lg border border-border bg-surface">
          {audits.length > 0 ? (
            <div className="divide-y divide-border">
              {audits.map((audit) => (
                <div
                  key={audit.id}
                  className="flex items-center justify-between px-5 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">
                      {audit.url || "Unknown URL"}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {audit.page_type || "unknown"} &middot;{" "}
                      {new Date(audit.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="ml-4 flex items-center gap-3">
                    {audit.issues &&
                      Array.isArray(audit.issues) &&
                      audit.issues.length > 0 && (
                        <span className="text-xs text-warning">
                          {audit.issues.length} issue
                          {audit.issues.length !== 1 ? "s" : ""}
                        </span>
                      )}
                    <ScoreBadge score={audit.seo_score} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="px-5 py-12 text-center text-sm text-muted">
              No pages analyzed yet. Install the script tag to start.
            </p>
          )}
        </section>
      )}

      {/* Content tab */}
      {tab === "content" && (
        <section className="rounded-lg border border-border bg-surface">
          {content.length > 0 ? (
            <div className="divide-y divide-border">
              {content.map((c) => (
                <div key={c.id} className="px-5 py-3">
                  <div className="flex items-center justify-between">
                    <p className="truncate text-sm">
                      {c.url || "Unknown URL"}
                    </p>
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-medium ${
                        c.status === "active"
                          ? "bg-success/10 text-success"
                          : "bg-muted/10 text-muted"
                      }`}
                    >
                      {c.status || "draft"}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                    {c.page_type && <span>Type: {c.page_type}</span>}
                    {c.meta_description && <span>Meta desc present</span>}
                    {c.og_title && <span>OG tags present</span>}
                    {Array.isArray(c.structured_data) &&
                      (c.structured_data as unknown[]).length > 0 ? (
                        <span>
                          {(c.structured_data as unknown[]).length} schema(s)
                        </span>
                      ) : null}
                    <span>
                      Updated{" "}
                      {new Date(c.updated_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="px-5 py-12 text-center text-sm text-muted">
              No SEO content generated yet. Install the script tag to start.
            </p>
          )}
        </section>
      )}
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
