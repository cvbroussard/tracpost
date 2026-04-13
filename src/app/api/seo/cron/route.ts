import { sql } from "@/lib/db";
import { auditSite } from "@/lib/seo/audit";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/seo/cron — Weekly SEO audit for all sites.
 *
 * Secured by CRON_SECRET header (Vercel Cron or external scheduler).
 * Runs a full audit for every site that has a URL configured.
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization");

  if (
    !process.env.CRON_SECRET ||
    secret !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get all sites with URLs
    const sites = await sql`
      SELECT s.id, s.url, s.name, sub.is_active
      FROM sites s
      JOIN subscriptions sub ON sub.id = s.subscription_id
      WHERE s.url IS NOT NULL
        AND s.url != ''
        AND sub.is_active = true
    `;

    const results: Array<{
      siteId: string;
      siteName: string;
      score: number | null;
      error: string | null;
    }> = [];

    for (const site of sites) {
      try {
        const audit = await auditSite(
          site.id as string,
          site.url as string
        );
        results.push({
          siteId: site.id as string,
          siteName: site.name as string,
          score: audit.overallScore,
          error: null,
        });
      } catch (err) {
        results.push({
          siteId: site.id as string,
          siteName: site.name as string,
          score: null,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    const summary = {
      totalSites: sites.length,
      audited: results.filter((r) => r.error === null).length,
      failed: results.filter((r) => r.error !== null).length,
      averageScore:
        results.filter((r) => r.score !== null).length > 0
          ? Math.round(
              results
                .filter((r) => r.score !== null)
                .reduce((sum, r) => sum + r.score!, 0) /
                results.filter((r) => r.score !== null).length
            )
          : null,
    };

    return NextResponse.json({ summary, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
