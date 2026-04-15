/**
 * Work page data loader — project portfolio teaser for the marketing site.
 * Detailed project pages remain at /projects/[slug].
 */
import "server-only";
import { sql } from "@/lib/db";
import type { WebsiteCopy } from "@/lib/tenant-site/copy-generator";

export interface WorkPageData {
  headline: string;
  subtitle: string;
  blogTitle: string;
  blogSubtitle: string;
  projects: Array<{
    name: string;
    slug: string;
    description: string | null;
    coverImage: string | null;
    assetCount: number;
  }>;
  articles: Array<{
    title: string;
    slug: string;
    excerpt: string | null;
    image: string | null;
    date: string | null;
  }>;
}

export async function loadWorkPage(siteId: string): Promise<WorkPageData> {
  const [site] = await sql`SELECT website_copy FROM sites WHERE id = ${siteId}`;
  const copy = (site?.website_copy as WebsiteCopy | null) || null;
  const workCopy = copy?.work;

  const projectRows = await sql`
    SELECT p.name, p.slug, p.description,
           (SELECT COUNT(*)::int FROM asset_projects ap WHERE ap.project_id = p.id) AS asset_count,
           (SELECT ma.storage_url FROM asset_projects ap2
            JOIN media_assets ma ON ma.id = ap2.asset_id
            WHERE ap2.project_id = p.id AND ma.media_type LIKE 'image%'
            ORDER BY ma.quality_score DESC NULLS LAST LIMIT 1
           ) AS cover_image
    FROM projects p
    WHERE p.site_id = ${siteId}
      AND (SELECT COUNT(*) FROM asset_projects ap WHERE ap.project_id = p.id) >= 3
    ORDER BY p.start_date DESC NULLS LAST
  `;

  const articleRows = await sql`
    SELECT title, slug, excerpt, og_image_url, published_at
    FROM blog_posts
    WHERE site_id = ${siteId} AND status = 'published'
    ORDER BY published_at DESC
    LIMIT 6
  `;

  return {
    headline: workCopy?.headline || "Our Work",
    subtitle: workCopy?.subtitle || "",
    blogTitle: workCopy?.blogTitle || "Writing",
    blogSubtitle: workCopy?.blogSubtitle || "",
    projects: projectRows.map((p) => ({
      name: String(p.name),
      slug: String(p.slug),
      description: p.description ? String(p.description) : null,
      coverImage: p.cover_image ? String(p.cover_image) : null,
      assetCount: Number(p.asset_count) || 0,
    })),
    articles: articleRows.map((a) => ({
      title: String(a.title),
      slug: String(a.slug),
      excerpt: a.excerpt ? String(a.excerpt).slice(0, 160) : null,
      image: a.og_image_url ? String(a.og_image_url) : null,
      date: a.published_at
        ? new Date(String(a.published_at)).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })
        : null,
    })),
  };
}
