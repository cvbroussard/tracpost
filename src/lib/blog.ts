import { sql } from "./db";

/**
 * Resolve a blog hostname to a site ID.
 *
 * Checks blog_settings for matching subdomain or custom_domain.
 * Falls back to blog.tracpost.com pattern (single-tenant for now).
 */
interface BlogSite {
  siteId: string;
  siteName: string;
  blogTitle: string;
  blogDescription: string;
  theme: Record<string, unknown>;
}

function toBlogSite(row: Record<string, unknown>): BlogSite {
  return {
    siteId: row.site_id as string,
    siteName: row.site_name as string,
    blogTitle: (row.blog_title as string) || "",
    blogDescription: (row.blog_description as string) || "",
    theme: (row.theme as Record<string, unknown>) || {},
  };
}

export async function resolveBlogSite(hostname: string): Promise<BlogSite | null> {
  const host = hostname.split(":")[0];

  // Try custom domain first
  const [byDomain] = await sql`
    SELECT bs.site_id, s.name AS site_name, bs.blog_title, bs.blog_description, bs.theme
    FROM blog_settings bs
    JOIN sites s ON s.id = bs.site_id
    WHERE bs.custom_domain = ${host} AND bs.blog_enabled = true
  `;
  if (byDomain) return toBlogSite(byDomain);

  // Try subdomain pattern (e.g., blog.hektork9.com)
  const [bySubdomain] = await sql`
    SELECT bs.site_id, s.name AS site_name, bs.blog_title, bs.blog_description, bs.theme
    FROM blog_settings bs
    JOIN sites s ON s.id = bs.site_id
    WHERE bs.subdomain = ${host} AND bs.blog_enabled = true
  `;
  if (bySubdomain) return toBlogSite(bySubdomain);

  // Fallback: blog.tracpost.com serves the first blog-enabled site
  if (host === "blog.tracpost.com") {
    const [first] = await sql`
      SELECT bs.site_id, s.name AS site_name, bs.blog_title, bs.blog_description, bs.theme
      FROM blog_settings bs
      JOIN sites s ON s.id = bs.site_id
      WHERE bs.blog_enabled = true
      ORDER BY bs.created_at ASC
      LIMIT 1
    `;
    if (first) return toBlogSite(first);
  }

  return null;
}

/**
 * Fetch published blog posts for a site.
 */
export async function getBlogPosts(
  siteId: string,
  limit = 20,
  offset = 0
): Promise<Array<Record<string, unknown>>> {
  return sql`
    SELECT id, slug, title, excerpt, og_image_url, tags,
           content_pillar, published_at, created_at
    FROM blog_posts
    WHERE site_id = ${siteId} AND status = 'published'
    ORDER BY published_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
}

/**
 * Fetch a single blog post by slug.
 */
export async function getBlogPost(
  siteId: string,
  slug: string
): Promise<Record<string, unknown> | null> {
  const [post] = await sql`
    SELECT id, slug, title, body, excerpt, meta_title, meta_description,
           og_image_url, schema_json, tags, content_pillar,
           published_at, created_at
    FROM blog_posts
    WHERE site_id = ${siteId} AND slug = ${slug} AND status = 'published'
  `;
  return post || null;
}
