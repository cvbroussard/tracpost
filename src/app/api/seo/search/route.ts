import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";

/**
 * GET /api/seo/search?site_id=xxx&days=28
 * Returns search performance data for the tenant's site.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const siteId = url.searchParams.get("site_id");
  const days = Number(url.searchParams.get("days")) || 28;

  if (!siteId) {
    return NextResponse.json({ error: "site_id required" }, { status: 400 });
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const rows = await sql`
    SELECT query, SUM(impressions)::int AS impressions, SUM(clicks)::int AS clicks,
           ROUND(AVG(position)::numeric, 1) AS avg_position
    FROM search_performance
    WHERE site_id = ${siteId} AND date >= ${cutoff.toISOString().split("T")[0]}
    GROUP BY query
    ORDER BY impressions DESC
    LIMIT 100
  `;

  const pageRows = await sql`
    SELECT url, SUM(clicks)::int AS clicks, SUM(impressions)::int AS impressions,
           COUNT(DISTINCT query)::int AS query_count
    FROM search_performance
    WHERE site_id = ${siteId} AND date >= ${cutoff.toISOString().split("T")[0]}
    GROUP BY url
    ORDER BY clicks DESC
    LIMIT 50
  `;

  return NextResponse.json({
    queries: rows.map(r => ({
      query: r.query,
      impressions: r.impressions,
      clicks: r.clicks,
      avgPosition: r.avg_position,
      ctr: (r.impressions as number) > 0 ? Math.round(((r.clicks as number) / (r.impressions as number)) * 1000) / 10 : 0,
    })),
    pages: pageRows,
  });
}
