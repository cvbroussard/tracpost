import { sql } from "@/lib/db";
import { crawlSite, type CrawlPageResult } from "./crawler";
import { getCoreWebVitals, type CwvResult } from "./cwv";

// ── Types ────────────────────────────────────────────────────

export type IssueSeverity = "critical" | "warning" | "info";

export type IssueCategory =
  | "missing_meta"
  | "duplicate_titles"
  | "missing_schema"
  | "broken_internal_links"
  | "missing_alt_text"
  | "missing_canonical"
  | "missing_og"
  | "slow_pages";

export interface AuditIssue {
  category: IssueCategory;
  severity: IssueSeverity;
  url: string;
  message: string;
}

export interface PageAuditResult {
  url: string;
  score: number;
  issues: AuditIssue[];
  title: string | null;
  h1: string | null;
  pageType: string;
  cwv: CwvResult | null;
}

export interface AuditResult {
  siteId: string;
  siteUrl: string;
  overallScore: number;
  totalPages: number;
  issues: AuditIssue[];
  pages: PageAuditResult[];
  cwvSummary: CwvResult | null;
  startedAt: string;
  completedAt: string;
}

// ── Main audit orchestrator ──────────────────────────────────

/**
 * Run a full SEO audit for a site: crawl → analyze → score → store.
 */
export async function auditSite(
  siteId: string,
  siteUrl: string,
  maxPages: number = 30
): Promise<AuditResult> {
  const startedAt = new Date().toISOString();

  // Step 1: Crawl the site
  const crawlResult = await crawlSite(siteUrl, maxPages);

  // Step 2: Analyze each page and collect issues
  const allIssues: AuditIssue[] = [];
  const pageResults: PageAuditResult[] = [];
  const titleMap = new Map<string, string[]>(); // title → urls

  for (const page of crawlResult.pages) {
    const issues = analyzePageIssues(page);
    const score = calculatePageScore(issues);

    // Track titles for duplicate detection
    if (page.title) {
      const existing = titleMap.get(page.title) || [];
      existing.push(page.url);
      titleMap.set(page.title, existing);
    }

    pageResults.push({
      url: page.url,
      score,
      issues,
      title: page.title,
      h1: page.h1,
      pageType: page.seoAnalysis.pageType,
      cwv: null, // filled below for homepage
    });

    allIssues.push(...issues);
  }

  // Step 3: Detect duplicate titles
  for (const [title, urls] of titleMap) {
    if (urls.length > 1) {
      for (const url of urls) {
        const issue: AuditIssue = {
          category: "duplicate_titles",
          severity: "warning",
          url,
          message: `Duplicate title "${title}" shared with ${urls.length - 1} other page(s)`,
        };
        allIssues.push(issue);
        const pageResult = pageResults.find((p) => p.url === url);
        if (pageResult) {
          pageResult.issues.push(issue);
          pageResult.score = calculatePageScore(pageResult.issues);
        }
      }
    }
  }

  // Step 4: Check CWV for the homepage only (to avoid API rate limits)
  let cwvSummary: CwvResult | null = null;
  const homepage = pageResults.find(
    (p) => p.pageType === "homepage" || p.url === siteUrl
  );
  if (homepage) {
    cwvSummary = await getCoreWebVitals(homepage.url);
    homepage.cwv = cwvSummary;

    // Add slow page issues from CWV
    if (cwvSummary.lcp && cwvSummary.lcp.status === "poor") {
      const issue: AuditIssue = {
        category: "slow_pages",
        severity: "critical",
        url: homepage.url,
        message: `LCP is ${cwvSummary.lcp.value}ms (poor, target <2500ms)`,
      };
      allIssues.push(issue);
      homepage.issues.push(issue);
    } else if (cwvSummary.lcp && cwvSummary.lcp.status === "needs_improvement") {
      const issue: AuditIssue = {
        category: "slow_pages",
        severity: "warning",
        url: homepage.url,
        message: `LCP is ${cwvSummary.lcp.value}ms (needs improvement, target <2500ms)`,
      };
      allIssues.push(issue);
      homepage.issues.push(issue);
    }

    if (cwvSummary.cls && cwvSummary.cls.status === "poor") {
      const issue: AuditIssue = {
        category: "slow_pages",
        severity: "critical",
        url: homepage.url,
        message: `CLS is ${cwvSummary.cls.value} (poor, target <0.1)`,
      };
      allIssues.push(issue);
      homepage.issues.push(issue);
    }
  }

  // Step 5: Calculate overall score
  const overallScore =
    pageResults.length > 0
      ? Math.round(
          pageResults.reduce((sum, p) => sum + p.score, 0) /
            pageResults.length
        )
      : 0;

  const completedAt = new Date().toISOString();

  const result: AuditResult = {
    siteId,
    siteUrl,
    overallScore,
    totalPages: pageResults.length,
    issues: allIssues,
    pages: pageResults,
    cwvSummary,
    startedAt,
    completedAt,
  };

  // Step 6: Store in seo_audits
  await storeAuditResults(siteId, result);

  return result;
}

// ── Per-page issue detection ─────────────────────────────────

function analyzePageIssues(page: CrawlPageResult): AuditIssue[] {
  const issues: AuditIssue[] = [];
  const analysis = page.seoAnalysis;

  // Missing meta description
  if (analysis.missing.metaDescription) {
    issues.push({
      category: "missing_meta",
      severity: "critical",
      url: page.url,
      message: "Missing meta description",
    });
  }

  // Missing or empty title
  if (!page.title) {
    issues.push({
      category: "missing_meta",
      severity: "critical",
      url: page.url,
      message: "Missing page title",
    });
  }

  // Missing H1
  if (!page.h1) {
    issues.push({
      category: "missing_meta",
      severity: "warning",
      url: page.url,
      message: "Missing H1 heading",
    });
  }

  // Missing canonical
  if (analysis.missing.canonical) {
    issues.push({
      category: "missing_canonical",
      severity: "warning",
      url: page.url,
      message: "Missing canonical URL",
    });
  }

  // Missing OG tags
  if (analysis.missing.ogTitle) {
    issues.push({
      category: "missing_og",
      severity: "warning",
      url: page.url,
      message: "Missing og:title tag",
    });
  }
  if (analysis.missing.ogDescription) {
    issues.push({
      category: "missing_og",
      severity: "warning",
      url: page.url,
      message: "Missing og:description tag",
    });
  }
  if (analysis.missing.ogImage) {
    issues.push({
      category: "missing_og",
      severity: "info",
      url: page.url,
      message: "Missing og:image tag",
    });
  }

  // Missing structured data
  if (analysis.missing.jsonLd) {
    issues.push({
      category: "missing_schema",
      severity: "warning",
      url: page.url,
      message: "No JSON-LD structured data found",
    });
  }

  // Missing alt text on images
  const imagesWithoutAlt = page.images.filter((img) => !img.alt);
  if (imagesWithoutAlt.length > 0) {
    issues.push({
      category: "missing_alt_text",
      severity: imagesWithoutAlt.length > 5 ? "warning" : "info",
      url: page.url,
      message: `${imagesWithoutAlt.length} image(s) missing alt text`,
    });
  }

  // Broken internal links (pages that returned errors)
  if (page.error) {
    issues.push({
      category: "broken_internal_links",
      severity: "critical",
      url: page.url,
      message: `Page returned error: ${page.error}`,
    });
  }

  return issues;
}

// ── Scoring ──────────────────────────────────────────────────

function calculatePageScore(issues: AuditIssue[]): number {
  let score = 100;

  for (const issue of issues) {
    switch (issue.severity) {
      case "critical":
        score -= 15;
        break;
      case "warning":
        score -= 7;
        break;
      case "info":
        score -= 2;
        break;
    }
  }

  return Math.max(0, Math.min(100, score));
}

// ── Storage ──────────────────────────────────────────────────

async function storeAuditResults(
  siteId: string,
  result: AuditResult
): Promise<void> {
  // Store one summary audit row
  try {
    await sql`
      INSERT INTO seo_audits (business_id, page_type, page_id, url, audit_data, seo_score, issues)
      VALUES (
        ${siteId},
        'site_audit',
        ${"audit_" + new Date().toISOString()},
        ${result.siteUrl},
        ${JSON.stringify({
          totalPages: result.totalPages,
          cwvSummary: result.cwvSummary,
          startedAt: result.startedAt,
          completedAt: result.completedAt,
          pages: result.pages.map((p) => ({
            url: p.url,
            score: p.score,
            title: p.title,
            h1: p.h1,
            pageType: p.pageType,
            issueCount: p.issues.length,
          })),
        })},
        ${result.overallScore},
        ${JSON.stringify(result.issues)}
      )
    `;
  } catch {
    // Non-fatal — audit data is still returned to caller
  }

  // Store per-page audit rows
  for (const page of result.pages) {
    try {
      const pathname = new URL(page.url).pathname;
      await sql`
        INSERT INTO seo_audits (business_id, page_type, page_id, url, audit_data, seo_score, issues)
        VALUES (
          ${siteId},
          ${page.pageType},
          ${pathname},
          ${page.url},
          ${JSON.stringify({
            title: page.title,
            h1: page.h1,
            cwv: page.cwv,
          })},
          ${page.score},
          ${JSON.stringify(page.issues)}
        )
      `;
    } catch {
      // Non-fatal
    }
  }
}
