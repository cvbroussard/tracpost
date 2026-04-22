import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { ScoresClient } from "./scores-client";

export const dynamic = "force-dynamic";

export default async function SeoScoresPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  if (!session.activeSiteId) {
    return (
      <div className="p-4 space-y-6">
        <h1 className="mb-1 text-lg font-semibold">Page Scores</h1>
        <p className="py-12 text-center text-sm text-muted">Add a site first.</p>
      </div>
    );
  }

  const siteId = session.activeSiteId;

  const [scores, siteRows] = await Promise.all([
    sql`
      SELECT url, performance, seo, accessibility, best_practices, scored_at
      FROM page_scores
      WHERE site_id = ${siteId}
      ORDER BY url ASC
    `,
    sql`SELECT id, name FROM sites WHERE id = ${siteId}`,
  ]);

  return (
    <ScoresClient
      siteId={siteId}
      siteName={(siteRows[0]?.name as string) || ""}
      scores={scores as Array<{
        url: string;
        performance: number;
        seo: number;
        accessibility: number;
        best_practices: number;
        scored_at: string;
      }>}
    />
  );
}
