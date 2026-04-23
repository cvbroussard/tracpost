import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const maxDuration = 60;

const API_KEY = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
const PSI_URL = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

/**
 * GET /api/seo/score-cron
 * Scores one page per invocation, round-robin across all active sites.
 * Picks the page with the oldest scored_at (or never scored).
 * Called hourly — scores ~24 pages/day across all sites.
 */
export async function GET() {
  if (!API_KEY) {
    return NextResponse.json({ error: "No API key" }, { status: 500 });
  }

  // Find all active sites with custom domains
  const sites = await sql`
    SELECT s.id, bs.custom_domain, bs.subdomain
    FROM sites s
    LEFT JOIN blog_settings bs ON bs.site_id = s.id
    WHERE s.is_active = true
      AND (bs.custom_domain IS NOT NULL OR bs.subdomain IS NOT NULL)
  `;

  if (sites.length === 0) {
    return NextResponse.json({ skipped: true, reason: "no sites" });
  }

  // Collect all sitemap URLs across all sites
  const candidates: Array<{ siteId: string; url: string; scoredAt: string | null }> = [];

  for (const site of sites) {
    const siteId = site.id as string;
    const domain = site.custom_domain as string | null;
    const slug = site.subdomain as string | null;
    const baseUrl = domain ? `https://${domain}` : `https://tracpost.com/${slug}`;

    // Get known URLs from page_scores (already discovered)
    const existing = await sql`
      SELECT url, scored_at FROM page_scores WHERE site_id = ${siteId}
    `;

    if (existing.length > 0) {
      for (const row of existing) {
        candidates.push({ siteId, url: row.url as string, scoredAt: row.scored_at as string });
      }
    } else {
      // No scores yet — seed with core pages
      const corePaths = ["", "/about", "/blog", "/projects", "/contact", "/work"];
      for (const path of corePaths) {
        candidates.push({ siteId, url: `${baseUrl}${path}`, scoredAt: null });
      }
    }
  }

  if (candidates.length === 0) {
    return NextResponse.json({ skipped: true, reason: "no pages" });
  }

  // Pick the oldest scored page (or never scored first)
  candidates.sort((a, b) => {
    if (!a.scoredAt && !b.scoredAt) return 0;
    if (!a.scoredAt) return -1;
    if (!b.scoredAt) return 1;
    return new Date(a.scoredAt).getTime() - new Date(b.scoredAt).getTime();
  });

  const target = candidates[0];

  // Score it
  try {
    const qs = `url=${encodeURIComponent(target.url)}&key=${API_KEY}&strategy=mobile&category=PERFORMANCE&category=SEO&category=ACCESSIBILITY&category=BEST_PRACTICES`;
    const res = await fetch(`${PSI_URL}?${qs}`, { signal: AbortSignal.timeout(45000) });

    if (!res.ok) {
      const text = await res.text();
      console.warn("PageSpeed cron failed:", res.status, text.slice(0, 200));
      return NextResponse.json({ error: "PageSpeed API failed", url: target.url });
    }

    const data = await res.json();
    const cats = data.lighthouseResult?.categories || {};

    const performance = Math.round((cats.performance?.score || 0) * 100);
    const seo = Math.round((cats.seo?.score || 0) * 100);
    const accessibility = Math.round((cats.accessibility?.score || 0) * 100);
    const bestPractices = Math.round((cats["best-practices"]?.score || 0) * 100);

    const allAudits = data.lighthouseResult?.audits || {};
    const audits = Object.values(allAudits)
      .filter((a: unknown) => {
        const audit = a as { score?: number | null };
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

    await sql`
      INSERT INTO page_scores (site_id, url, performance, seo, accessibility, best_practices, audits, scored_at)
      VALUES (${target.siteId}, ${target.url}, ${performance}, ${seo}, ${accessibility}, ${bestPractices}, ${JSON.stringify(audits)}, NOW())
      ON CONFLICT (site_id, url) DO UPDATE SET
        performance = EXCLUDED.performance,
        seo = EXCLUDED.seo,
        accessibility = EXCLUDED.accessibility,
        best_practices = EXCLUDED.best_practices,
        audits = EXCLUDED.audits,
        scored_at = NOW()
    `;

    return NextResponse.json({
      scored: true,
      url: target.url,
      performance,
      seo,
      accessibility,
      bestPractices,
    });
  } catch (err) {
    console.error("PageSpeed cron error:", err);
    return NextResponse.json({ error: "Scoring failed", url: target.url });
  }
}
