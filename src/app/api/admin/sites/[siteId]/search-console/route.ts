import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { fetchSearchAnalytics, syncSearchPerformance } from "@/lib/gsc/search-console";

/**
 * GET /api/admin/sites/[siteId]/search-console?days=28
 * Returns search performance data (live query or from DB).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const { siteId } = await params;
  const days = Number(new URL(req.url).searchParams.get("days")) || 28;
  const source = new URL(req.url).searchParams.get("source") || "db";

  if (source === "live") {
    const rows = await fetchSearchAnalytics(siteId, days);
    return NextResponse.json({ rows, count: rows.length, source: "live" });
  }

  // From DB
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const rows = await sql`
    SELECT url, query, impressions, clicks, ctr, position, date
    FROM search_performance
    WHERE site_id = ${siteId} AND date >= ${cutoff.toISOString().split("T")[0]}
    ORDER BY impressions DESC
    LIMIT 500
  `;

  // Aggregate by query
  const queryMap = new Map<string, { query: string; impressions: number; clicks: number; ctr: number; position: number; pages: string[] }>();
  for (const row of rows) {
    const q = row.query as string;
    const existing = queryMap.get(q);
    if (existing) {
      existing.impressions += row.impressions as number;
      existing.clicks += row.clicks as number;
      if (!existing.pages.includes(row.url as string)) existing.pages.push(row.url as string);
    } else {
      queryMap.set(q, {
        query: q,
        impressions: row.impressions as number,
        clicks: row.clicks as number,
        ctr: row.ctr as number,
        position: row.position as number,
        pages: [row.url as string],
      });
    }
  }

  const queries = [...queryMap.values()]
    .map(q => ({ ...q, ctr: q.clicks > 0 ? Math.round((q.clicks / q.impressions) * 1000) / 10 : 0 }))
    .sort((a, b) => b.impressions - a.impressions);

  // Aggregate by page
  const pageMap = new Map<string, { url: string; impressions: number; clicks: number; queries: number }>();
  for (const row of rows) {
    const u = row.url as string;
    const existing = pageMap.get(u);
    if (existing) {
      existing.impressions += row.impressions as number;
      existing.clicks += row.clicks as number;
      existing.queries++;
    } else {
      pageMap.set(u, { url: u, impressions: row.impressions as number, clicks: row.clicks as number, queries: 1 });
    }
  }

  const pages = [...pageMap.values()].sort((a, b) => b.clicks - a.clicks);

  return NextResponse.json({ queries, pages, count: rows.length, source: "db" });
}

/**
 * POST /api/admin/sites/[siteId]/search-console
 * Body: { action: "sync", days?: number }
 * Body: { action: "set_property", property: "sc-domain:example.com" }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (adminCookie !== "authenticated") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { siteId } = await params;
  const body = await req.json();

  if (body.action === "set_property") {
    await sql`UPDATE sites SET gsc_property = ${body.property} WHERE id = ${siteId}`;
    return NextResponse.json({ success: true, property: body.property });
  }

  if (body.action === "sync") {
    const days = body.days || 28;
    const stored = await syncSearchPerformance(siteId, days);
    return NextResponse.json({ success: true, stored });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
