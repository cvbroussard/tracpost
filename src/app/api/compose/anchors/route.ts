import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";

/**
 * GET /api/compose/anchors
 *
 * Returns the active site's v2 anchor pool — published blog articles,
 * active projects, and active services. Each anchor is a Topic the
 * subscriber can pick on Step 1 of Compose.
 *
 * v2 ONLY. No fallback to legacy blog_posts/projects tables. Per the
 * v2 cutover discipline (project_tracpost_v2_article_schema.md), an
 * empty v2 pool means an empty picker — no silent fallback.
 *
 * Each anchor carries: id, type (blog_post|project|service), title,
 * slug, hero thumbnail, content pillar, excerpt, usage count, full URL.
 */
export async function GET(_req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const siteId = session.activeSiteId;
  if (!siteId) return NextResponse.json({ error: "No active site" }, { status: 400 });

  // Site URL = anchor URL prefix.
  const [siteRow] = await sql`SELECT url FROM businesses WHERE id = ${siteId}`;
  const siteUrl = (siteRow?.url as string | null)?.replace(/\/+$/, "") || "";

  // Blog articles (v2): published only.
  const blogPosts = await sql`
    SELECT b.id, b.slug, b.title, b.excerpt, b.content_pillars,
           b.published_at, ma.storage_url AS hero_url
    FROM blog_posts_v2 b
    LEFT JOIN media_assets ma ON ma.id = b.hero_asset_id
    WHERE b.business_id = ${siteId}
      AND b.status = 'published'
    ORDER BY b.published_at DESC NULLS LAST
  `;

  // Projects (v2): active only (archived hidden from picker).
  const projects = await sql`
    SELECT p.id, p.slug, p.name AS title, p.description AS excerpt,
           p.content_pillars, p.start_date, p.end_date,
           ma.storage_url AS hero_url
    FROM projects_v2 p
    LEFT JOIN media_assets ma ON ma.id = p.hero_asset_id
    WHERE p.business_id = ${siteId}
      AND p.status = 'active'
    ORDER BY COALESCE(p.end_date, p.start_date, p.created_at) DESC NULLS LAST
  `;

  // Services (v2): active only.
  const services = await sql`
    SELECT s.id, s.slug, s.name AS title, s.excerpt, s.content_pillars,
           s.display_order, s.created_at,
           ma.storage_url AS hero_url
    FROM services_v2 s
    LEFT JOIN media_assets ma ON ma.id = s.hero_asset_id
    WHERE s.business_id = ${siteId}
      AND s.status = 'active'
    ORDER BY s.display_order ASC, s.created_at DESC
  `;

  // Usage count — inferred from past social_posts.link_url containing
  // the anchor's slug. Once social_posts.metadata.anchor_id is widely
  // populated (post-Compose-v2-swap), switch to that for precision.
  const allSlugs = [
    ...blogPosts.map((b) => b.slug as string),
    ...projects.map((p) => p.slug as string),
    ...services.map((s) => s.slug as string),
  ];
  const usageCounts = new Map<string, number>();
  if (allSlugs.length > 0) {
    const usageRows = await sql`
      SELECT sp.link_url
      FROM social_posts sp
      JOIN social_accounts sa ON sa.id = sp.account_id
      WHERE sa.billing_account_id = ${session.subscriptionId}
        AND sp.link_url IS NOT NULL
    `;
    for (const row of usageRows) {
      const url = String(row.link_url || "");
      for (const slug of allSlugs) {
        if (url.includes(`/${slug}`)) {
          usageCounts.set(slug, (usageCounts.get(slug) || 0) + 1);
        }
      }
    }
  }

  const firstPillar = (arr: unknown): string | null => {
    if (!Array.isArray(arr) || arr.length === 0) return null;
    return (arr[0] as string) || null;
  };

  const anchors = [
    ...blogPosts.map((b) => ({
      id: b.id as string,
      type: "blog_post" as const,
      title: b.title as string,
      slug: b.slug as string,
      contentPillar: firstPillar(b.content_pillars),
      heroUrl: (b.hero_url as string | null) || null,
      excerpt: (b.excerpt as string | null) || null,
      publishedAt: b.published_at as string | null,
      usedCount: usageCounts.get(b.slug as string) || 0,
      url: siteUrl ? `${siteUrl}/blog/${b.slug}` : `/blog/${b.slug}`,
    })),
    ...projects.map((p) => ({
      id: p.id as string,
      type: "project" as const,
      title: p.title as string,
      slug: p.slug as string,
      contentPillar: firstPillar(p.content_pillars),
      heroUrl: (p.hero_url as string | null) || null,
      excerpt: (p.excerpt as string | null) || null,
      publishedAt: (p.end_date as string | null) || (p.start_date as string | null) || null,
      usedCount: usageCounts.get(p.slug as string) || 0,
      url: siteUrl ? `${siteUrl}/projects/${p.slug}` : `/projects/${p.slug}`,
    })),
    ...services.map((s) => ({
      id: s.id as string,
      type: "service" as const,
      title: s.title as string,
      slug: s.slug as string,
      contentPillar: firstPillar(s.content_pillars),
      heroUrl: (s.hero_url as string | null) || null,
      excerpt: (s.excerpt as string | null) || null,
      publishedAt: null,
      usedCount: usageCounts.get(s.slug as string) || 0,
      url: siteUrl ? `${siteUrl}/services/${s.slug}` : `/services/${s.slug}`,
    })),
  ];

  return NextResponse.json({ anchors, totalCount: anchors.length });
}
