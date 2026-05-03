import { verifyCookie } from "@/lib/cookie-sign";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

/**
 * GET /api/manage/blog?site_id=xxx
 * Returns recent articles and projects for a site.
 */
export async function GET(req: NextRequest) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (!verifyCookie(adminCookie)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const siteId = new URL(req.url).searchParams.get("site_id");
  if (!siteId) return NextResponse.json({ error: "site_id required" }, { status: 400 });

  const [articles, projects] = await Promise.all([
    sql`
      SELECT title, status, published_at
      FROM blog_posts
      WHERE site_id = ${siteId}
      ORDER BY created_at DESC
      LIMIT 20
    `,
    sql`
      SELECT id, name,
        COALESCE(jsonb_array_length(metadata->'article_prompts'), 0)::int AS prompt_count
      FROM projects
      WHERE site_id = ${siteId}
      ORDER BY name
    `,
  ]);

  return NextResponse.json({
    articles: articles.map(a => ({
      title: a.title,
      status: a.status,
      published_at: a.published_at,
    })),
    projects: projects.map(p => ({
      id: p.id,
      name: p.name,
      promptCount: (p.prompt_count as number) || 0,
    })),
  });
}
