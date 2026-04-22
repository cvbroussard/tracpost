import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { SeoOverviewClient } from "./seo-overview";

export const dynamic = "force-dynamic";

export default async function SeoPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  if (!session.activeSiteId) {
    return (
      <div className="p-4 space-y-6">
        <h1 className="mb-1 text-lg font-semibold">SEO</h1>
        <p className="py-12 text-center text-sm text-muted">Add a site first.</p>
      </div>
    );
  }

  const siteId = session.activeSiteId;

  const [siteRows, pageScores, searchData, contentRows] = await Promise.all([
    sql`SELECT id, name, url FROM sites WHERE id = ${siteId}`,

    sql`
      SELECT url, performance, seo, accessibility, best_practices, scored_at
      FROM page_scores
      WHERE site_id = ${siteId}
      ORDER BY url ASC
    `,

    sql`
      SELECT query, SUM(impressions)::int AS impressions, SUM(clicks)::int AS clicks,
             ROUND(AVG(position)::numeric, 1) AS avg_position
      FROM search_performance
      WHERE site_id = ${siteId}
        AND date >= (CURRENT_DATE - INTERVAL '28 days')
      GROUP BY query
      ORDER BY impressions DESC
      LIMIT 10
    `,

    sql`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE status = 'active')::int AS active
      FROM seo_content
      WHERE site_id = ${siteId}
    `,
  ]);

  const site = siteRows[0];
  const contentStats = contentRows[0] || { total: 0, active: 0 };

  return (
    <SeoOverviewClient
      siteName={(site?.name as string) || ""}
      pageScores={pageScores as Array<{
        url: string;
        performance: number;
        seo: number;
        accessibility: number;
        best_practices: number;
        scored_at: string;
      }>}
      topQueries={searchData as Array<{
        query: string;
        impressions: number;
        clicks: number;
        avg_position: number;
      }>}
      contentStats={{ total: contentStats.total as number, active: contentStats.active as number }}
    />
  );
}
