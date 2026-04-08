import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/projects/:id/generate-article
 *
 * Generate a blog article about this project.
 * Returns the article as a draft blog post.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;
  const { id } = await params;

  // Verify ownership
  const [project] = await sql`
    SELECT p.id, p.site_id FROM projects p
    JOIN sites s ON p.site_id = s.id
    WHERE p.id = ${id} AND s.subscription_id = ${auth.subscriptionId}
  `;
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  try {
    const { generateProjectArticle } = await import("@/lib/pipeline/project-blog-generator");
    const article = await generateProjectArticle(id, project.site_id as string);

    if (!article) {
      return NextResponse.json(
        { error: "Article generation failed — ensure the project has at least 3 captioned assets" },
        { status: 400 }
      );
    }

  // Save as draft blog post
  const slug = article.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

  const [post] = await sql`
    INSERT INTO blog_posts (site_id, title, slug, body, excerpt, status, source_asset_id, metadata)
    VALUES (
      ${project.site_id},
      ${article.title},
      ${slug},
      ${article.body},
      ${article.excerpt},
      'draft',
      ${article.featuredAssetId || null},
      ${JSON.stringify({
        type: "project",
        project_id: id,
        asset_ids: article.assets.map((a) => a.id),
      })}
    )
    RETURNING id, title, slug, status
  `;

    return NextResponse.json({ post, article: { title: article.title, excerpt: article.excerpt } });
  } catch (err) {
    console.error("Project article generation error:", err instanceof Error ? err.stack || err.message : err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Article generation failed" },
      { status: 500 }
    );
  }
}
