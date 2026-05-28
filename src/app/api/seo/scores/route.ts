import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";

/**
 * GET /api/seo/scores?site_id=xxx
 * Returns page scores for the tenant's site (no audits detail).
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const siteId = new URL(req.url).searchParams.get("site_id");
  if (!siteId) {
    return NextResponse.json({ error: "site_id required" }, { status: 400 });
  }

  const scores = await sql`
    SELECT url, performance, seo, accessibility, best_practices, scored_at
    FROM page_scores
    WHERE business_id = ${siteId}
    ORDER BY url ASC
  `;

  return NextResponse.json({ scores });
}
