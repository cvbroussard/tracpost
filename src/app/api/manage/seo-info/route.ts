import { verifyCookie } from "@/lib/cookie-sign";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function GET(req: NextRequest) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (!verifyCookie(adminCookie)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const siteId = new URL(req.url).searchParams.get("site_id");
  if (!siteId) return NextResponse.json({ error: "site_id required" }, { status: 400 });

  const [row] = await sql`
    SELECT s.gsc_property, s.gsc_verification_token,
           bs.custom_domain,
           (SELECT COUNT(*)::int FROM page_scores WHERE site_id = s.id) AS score_count,
           (SELECT COUNT(*)::int FROM search_performance WHERE site_id = s.id) AS search_count
    FROM sites s
    LEFT JOIN blog_settings bs ON bs.site_id = s.id
    WHERE s.id = ${siteId}
  `;

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    customDomain: row.custom_domain || null,
    gscProperty: row.gsc_property || null,
    gscVerificationToken: row.gsc_verification_token || null,
    scoreCount: row.score_count || 0,
    searchCount: row.search_count || 0,
  });
}
