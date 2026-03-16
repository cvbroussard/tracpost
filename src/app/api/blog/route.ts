import { sql } from "@/lib/db";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/blog?site_id=xxx — List blog posts for a site (subscriber dashboard).
 * POST /api/blog — Update blog settings or publish/unpublish a post.
 */
export async function GET(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  const { searchParams } = new URL(req.url);
  const siteId = searchParams.get("site_id");

  if (!siteId) {
    return NextResponse.json({ error: "site_id required" }, { status: 400 });
  }

  // Verify ownership
  const [site] = await sql`
    SELECT id FROM sites WHERE id = ${siteId} AND subscriber_id = ${auth.subscriberId}
  `;
  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  const [posts, settings] = await Promise.all([
    sql`
      SELECT id, slug, title, excerpt, og_image_url, tags,
             content_pillar, status, published_at, created_at
      FROM blog_posts
      WHERE site_id = ${siteId}
      ORDER BY created_at DESC
      LIMIT 50
    `,
    sql`
      SELECT blog_enabled, subdomain, custom_domain, blog_title,
             blog_description, theme
      FROM blog_settings
      WHERE site_id = ${siteId}
    `,
  ]);

  return NextResponse.json({
    posts,
    settings: settings[0] || null,
  });
}

/**
 * POST /api/blog — Manage blog settings and posts.
 *
 * Actions:
 * - { action: "settings", site_id, blog_enabled, blog_title, blog_description, subdomain }
 * - { action: "publish", post_id }
 * - { action: "unpublish", post_id }
 */
export async function POST(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  const body = await req.json();
  const { action } = body;

  if (action === "settings") {
    const { site_id, blog_enabled, blog_title, blog_description, subdomain } = body;

    // Verify ownership
    const [site] = await sql`
      SELECT id FROM sites WHERE id = ${site_id} AND subscriber_id = ${auth.subscriberId}
    `;
    if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });

    // Upsert blog_settings
    await sql`
      INSERT INTO blog_settings (site_id, blog_enabled, blog_title, blog_description, subdomain, updated_at)
      VALUES (${site_id}, ${blog_enabled ?? false}, ${blog_title || null}, ${blog_description || null}, ${subdomain || null}, NOW())
      ON CONFLICT (site_id)
      DO UPDATE SET
        blog_enabled = COALESCE(${blog_enabled}, blog_settings.blog_enabled),
        blog_title = COALESCE(${blog_title}, blog_settings.blog_title),
        blog_description = COALESCE(${blog_description}, blog_settings.blog_description),
        subdomain = COALESCE(${subdomain}, blog_settings.subdomain),
        updated_at = NOW()
    `;

    return NextResponse.json({ success: true });
  }

  if (action === "publish" || action === "unpublish") {
    const { post_id } = body;
    if (!post_id) return NextResponse.json({ error: "post_id required" }, { status: 400 });

    // Verify ownership via site
    const [post] = await sql`
      SELECT bp.id, bp.site_id
      FROM blog_posts bp
      JOIN sites s ON s.id = bp.site_id
      WHERE bp.id = ${post_id} AND s.subscriber_id = ${auth.subscriberId}
    `;
    if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });

    if (action === "publish") {
      await sql`
        UPDATE blog_posts
        SET status = 'published', published_at = COALESCE(published_at, NOW()), updated_at = NOW()
        WHERE id = ${post_id}
      `;
    } else {
      await sql`
        UPDATE blog_posts SET status = 'draft', updated_at = NOW() WHERE id = ${post_id}
      `;
    }

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
