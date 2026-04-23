import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const maxDuration = 300;

const API_KEY = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
const PSI_URL = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const MAX_PAGES = 50;

/**
 * Discover all page URLs from the sitemap index.
 * Fetches /sitemap.xml → finds sub-sitemaps → extracts all <loc> URLs.
 * Falls back to 6 core pages if sitemap is unavailable.
 */
async function discoverPagesFromSitemap(baseUrl: string): Promise<string[]> {
  const fallback = [
    baseUrl,
    `${baseUrl}/about`,
    `${baseUrl}/blog`,
    `${baseUrl}/projects`,
    `${baseUrl}/contact`,
    `${baseUrl}/work`,
  ];

  try {
    const indexRes = await fetch(`${baseUrl}/sitemap.xml`, { signal: AbortSignal.timeout(10000) });
    if (!indexRes.ok) return fallback;
    const indexXml = await indexRes.text();

    // Extract sub-sitemap URLs from the index
    const sitemapLocs = [...indexXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);

    if (sitemapLocs.length === 0) return fallback;

    const allUrls: string[] = [];

    for (const sitemapUrl of sitemapLocs) {
      try {
        const subRes = await fetch(sitemapUrl, { signal: AbortSignal.timeout(10000) });
        if (!subRes.ok) continue;
        const subXml = await subRes.text();
        const urls = [...subXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
        allUrls.push(...urls);
      } catch { /* skip failed sub-sitemap */ }
    }

    return allUrls.length > 0 ? allUrls.slice(0, MAX_PAGES) : fallback;
  } catch {
    return fallback;
  }
}

interface AuditItem {
  id: string;
  title: string;
  description: string;
  score: number | null;
  displayValue?: string;
}

async function scoreUrl(url: string): Promise<{
  performance: number;
  seo: number;
  accessibility: number;
  bestPractices: number;
  audits: AuditItem[];
}> {
  const qs = `url=${encodeURIComponent(url)}&key=${API_KEY}&strategy=mobile&category=PERFORMANCE&category=SEO&category=ACCESSIBILITY&category=BEST_PRACTICES`;

  const res = await fetch(`${PSI_URL}?${qs}`, { signal: AbortSignal.timeout(60000) });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PageSpeed API ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const cats = data.lighthouseResult?.categories || {};

  const performance = Math.round((cats.performance?.score || 0) * 100);
  const seo = Math.round((cats.seo?.score || 0) * 100);
  const accessibility = Math.round((cats.accessibility?.score || 0) * 100);
  const bestPractices = Math.round((cats["best-practices"]?.score || 0) * 100);

  // Extract failing audits (score < 1 and not null)
  const allAudits = data.lighthouseResult?.audits || {};
  const audits: AuditItem[] = Object.values(allAudits)
    .filter((a: unknown) => {
      const audit = a as { score?: number | null; title?: string };
      return audit.score !== null && audit.score !== undefined && audit.score < 1;
    })
    .map((a: unknown) => {
      const audit = a as { id: string; title: string; description: string; score: number; displayValue?: string };
      return {
        id: audit.id,
        title: audit.title,
        description: (audit.description || "").slice(0, 300),
        score: audit.score,
        displayValue: audit.displayValue,
      };
    })
    .sort((a, b) => (a.score ?? 1) - (b.score ?? 1))
    .slice(0, 30);

  return { performance, seo, accessibility, bestPractices, audits };
}

/**
 * GET /api/admin/sites/[siteId]/page-scores
 * Returns stored page scores for this site.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const { siteId } = await params;

  const scores = await sql`
    SELECT url, performance, seo, accessibility, best_practices, audits, scored_at
    FROM page_scores
    WHERE site_id = ${siteId}
    ORDER BY url ASC
  `;

  return NextResponse.json({ scores });
}

/**
 * POST /api/admin/sites/[siteId]/page-scores
 * Body: { url } — score a single page
 * Body: { action: "score_all" } — score all known pages from sitemap
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (adminCookie !== "authenticated") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!API_KEY) {
    return NextResponse.json({ error: "Google API key not configured" }, { status: 500 });
  }

  const { siteId } = await params;
  const body = await req.json();

  if (body.action === "score_all") {
    // Get site's custom domain or subdomain
    const [site] = await sql`
      SELECT bs.custom_domain, bs.subdomain
      FROM sites s
      LEFT JOIN blog_settings bs ON bs.site_id = s.id
      WHERE s.id = ${siteId}
    `;

    if (!site) {
      return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }

    const domain = site.custom_domain as string | null;
    const slug = site.subdomain as string | null;

    if (!domain && !slug) {
      return NextResponse.json({ error: "No domain or subdomain configured" }, { status: 400 });
    }

    const baseUrl = domain
      ? `https://${domain}`
      : `https://tracpost.com/${slug}`;

    // Discover pages from sitemap index → sub-sitemaps
    const pages = await discoverPagesFromSitemap(baseUrl);

    // Score in batches of 3 concurrently to stay within timeout
    const BATCH_SIZE = 3;
    const results: Array<Record<string, unknown>> = [];

    for (let i = 0; i < pages.length; i += BATCH_SIZE) {
      const batch = pages.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.allSettled(
        batch.map(async (url) => {
          const result = await scoreUrl(url);
          await sql`
            INSERT INTO page_scores (site_id, url, performance, seo, accessibility, best_practices, audits, scored_at)
            VALUES (${siteId}, ${url}, ${result.performance}, ${result.seo}, ${result.accessibility}, ${result.bestPractices}, ${JSON.stringify(result.audits)}, NOW())
            ON CONFLICT (site_id, url) DO UPDATE SET
              performance = EXCLUDED.performance,
              seo = EXCLUDED.seo,
              accessibility = EXCLUDED.accessibility,
              best_practices = EXCLUDED.best_practices,
              audits = EXCLUDED.audits,
              scored_at = NOW()
          `;
          return { url, ...result, status: "scored" };
        })
      );

      for (const r of batchResults) {
        if (r.status === "fulfilled") results.push(r.value);
        else results.push({ url: batch[batchResults.indexOf(r)], status: "error", error: String(r.reason) });
      }
    }

    return NextResponse.json({ results, scored: results.filter(r => r.status === "scored").length });
  }

  // Single URL scoring
  const { url } = body;
  if (!url) {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }

  try {
    const result = await scoreUrl(url);

    await sql`
      INSERT INTO page_scores (site_id, url, performance, seo, accessibility, best_practices, audits, scored_at)
      VALUES (${siteId}, ${url}, ${result.performance}, ${result.seo}, ${result.accessibility}, ${result.bestPractices}, ${JSON.stringify(result.audits)}, NOW())
      ON CONFLICT (site_id, url) DO UPDATE SET
        performance = EXCLUDED.performance,
        seo = EXCLUDED.seo,
        accessibility = EXCLUDED.accessibility,
        best_practices = EXCLUDED.best_practices,
        audits = EXCLUDED.audits,
        scored_at = NOW()
    `;

    return NextResponse.json({ url, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Scoring failed" },
      { status: 500 }
    );
  }
}
