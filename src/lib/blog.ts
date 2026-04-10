import { sql } from "./db";

/**
 * Resolve a blog hostname to a site ID.
 *
 * Checks blog_settings for matching subdomain or custom_domain.
 * Falls back to blog.tracpost.com pattern (multi-tenant hub).
 */
export interface BlogSite {
  siteId: string;
  siteName: string;
  blogSlug: string;
  blogTitle: string;
  blogDescription: string;
  theme: Record<string, unknown>;
}

function toBlogSite(row: Record<string, unknown>): BlogSite {
  return {
    siteId: row.site_id as string,
    siteName: row.site_name as string,
    blogSlug: (row.blog_slug as string) || "",
    blogTitle: (row.blog_title as string) || "",
    blogDescription: (row.blog_description as string) || "",
    theme: (row.theme as Record<string, unknown>) || {},
  };
}

/**
 * Slugify a string for URL-safe blog slugs.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * Check for departure redirects — active when a subscriber cancels
 * and provides a destination URL. Returns the redirect target base
 * URL if one exists, or null.
 */
export async function checkDepartureRedirect(
  hostname: string
): Promise<string | null> {
  const host = hostname.split(":")[0];

  const [redirect] = await sql`
    SELECT dr.target_base
    FROM departure_redirects dr
    JOIN blog_settings bs ON bs.site_id = dr.site_id
    WHERE (bs.subdomain = ${host} OR bs.custom_domain = ${host})
      AND dr.active_until > NOW()
    LIMIT 1
  `;

  return redirect ? (redirect.target_base as string) : null;
}

/**
 * Resolve a blog site from hostname.
 * Used by blog.tracpost.com (discovery hub) and the blog layout.
 * Custom domains are resolved by middleware via CUSTOM_DOMAIN_MAP
 * and rewritten to /blog/[siteSlug] before reaching this code.
 */
export async function resolveBlogSite(hostname: string): Promise<BlogSite | null> {
  const host = hostname.split(":")[0];

  // blog.tracpost.com — serves the first blog-enabled site (single-site fallback)
  if (host === "blog.tracpost.com") {
    const [first] = await sql`
      SELECT bs.site_id, s.name AS site_name, s.blog_slug,
             bs.blog_title, bs.blog_description, bs.theme
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
 * Get custom domain for a site (if configured).
 * Used for canonical URL generation — custom domain gets SEO credit.
 */
export async function getCustomDomain(siteId: string): Promise<string | null> {
  const [row] = await sql`
    SELECT custom_domain FROM blog_settings
    WHERE site_id = ${siteId} AND custom_domain IS NOT NULL
  `;
  return row ? (row.custom_domain as string) : null;
}

/**
 * Resolve a blog site by its slug or subdomain (for hub pages and tenant subdomains).
 * Checks sites.blog_slug first, then blog_settings.subdomain as fallback.
 */
export async function resolveBlogSiteBySlug(siteSlug: string): Promise<BlogSite | null> {
  const [row] = await sql`
    SELECT bs.site_id, s.name AS site_name, s.blog_slug,
           bs.blog_title, bs.blog_description, bs.theme
    FROM sites s
    JOIN blog_settings bs ON bs.site_id = s.id
    WHERE (s.blog_slug = ${siteSlug} OR bs.subdomain = ${siteSlug})
      AND bs.blog_enabled = true AND s.is_active = true
  `;
  return row ? toBlogSite(row) : null;
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
           og_image_url, schema_json, tags, content_pillar, metadata,
           published_at, updated_at, created_at
    FROM blog_posts
    WHERE site_id = ${siteId} AND slug = ${slug} AND status = 'published'
  `;
  return post || null;
}

/**
 * List all blog-enabled sites with slugs (for sitemap index + discovery).
 */
export async function getAllBlogSites(): Promise<Array<{
  siteId: string;
  siteName: string;
  blogSlug: string;
  blogTitle: string;
  blogDescription: string;
  latestPostDate: string | null;
}>> {
  const rows = await sql`
    SELECT s.id AS site_id, s.name AS site_name, s.blog_slug,
           bs.blog_title, bs.blog_description,
           (SELECT MAX(published_at) FROM blog_posts bp
            WHERE bp.site_id = s.id AND bp.status = 'published') AS latest_post_date
    FROM sites s
    JOIN blog_settings bs ON bs.site_id = s.id
    WHERE bs.blog_enabled = true AND s.blog_slug IS NOT NULL AND s.is_active = true
    ORDER BY s.name ASC
  `;
  return rows.map((r) => ({
    siteId: r.site_id as string,
    siteName: r.site_name as string,
    blogSlug: r.blog_slug as string,
    blogTitle: (r.blog_title as string) || "",
    blogDescription: (r.blog_description as string) || "",
    latestPostDate: r.latest_post_date ? String(r.latest_post_date) : null,
  }));
}
