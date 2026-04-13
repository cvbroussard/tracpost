/**
 * URL generation for tenant content.
 *
 * Three contexts that produce different URLs for the same content:
 *
 *   1. TracPost itself (siteSlug === "tracpost"):
 *      Single-segment root paths via next.config rewrites.
 *      /blog/[article], /projects/[project]
 *
 *   2. Tenant with active custom domain (e.g. blog.b2construct.com):
 *      Absolute URLs to the custom subdomain.
 *      https://blog.b2construct.com/[article]
 *
 *   3. Tenant on staging (no custom domain yet):
 *      Internal paths under /tenant/[siteSlug]/.
 *      Resolves on staging.tracpost.com via middleware rewrite,
 *      and works locally for development.
 *
 * All public-facing pages should use these helpers instead of
 * hardcoding /blog/[slug]/... or /projects/[slug]/... patterns.
 */

/** TracPost's reserved tenant slug. Used to detect the platform's own tenant. */
export const TRACPOST_SLUG = "tracpost";

/**
 * Slugs that cannot be claimed by tenants. They collide with reserved
 * subdomains, route segments, or platform-owned identifiers.
 *
 * Add new entries here when introducing routes that live at the root
 * (e.g., /studio, /admin) or new reserved subdomains.
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  "tracpost",
  "admin",
  "api",
  "app",
  "studio",
  "platform",
  "blog",
  "projects",
  "staging",
  "www",
  "tenant",
]);

/** True if a slug collides with a reserved name and cannot be assigned. */
export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.toLowerCase());
}

/** True when this site is TracPost itself. */
export function isTracpost(siteSlug: string): boolean {
  return siteSlug === TRACPOST_SLUG;
}

/**
 * Convert a blog custom domain to its projects sibling.
 * blog.b2construct.com → projects.b2construct.com
 */
function projectsDomainOf(customDomain: string): string {
  return customDomain.startsWith("blog.")
    ? customDomain.replace(/^blog\./, "projects.")
    : `projects.${customDomain.replace(/^[^.]+\./, "")}`;
}

// ──────────────────────────────────────────────────────────────────
// Blog
// ──────────────────────────────────────────────────────────────────

/** Hub URL — the blog landing page. */
export function blogHubUrl(siteSlug: string, customDomain?: string | null): string {
  if (isTracpost(siteSlug)) return "/blog";
  if (customDomain) return `https://${customDomain}`;
  return `/tenant/${siteSlug}/blog`;
}

/** Article URL — a single blog post. */
export function blogArticleUrl(
  siteSlug: string,
  articleSlug: string,
  customDomain?: string | null
): string {
  if (isTracpost(siteSlug)) return `/blog/${articleSlug}`;
  if (customDomain) return `https://${customDomain}/${articleSlug}`;
  return `/tenant/${siteSlug}/blog/${articleSlug}`;
}

/** RSS feed URL. */
export function blogFeedUrl(siteSlug: string, customDomain?: string | null): string {
  if (isTracpost(siteSlug)) return "/blog/feed.xml";
  if (customDomain) return `https://${customDomain}/feed.xml`;
  return `/tenant/${siteSlug}/blog/feed.xml`;
}

/** Sitemap URL. */
export function blogSitemapUrl(siteSlug: string, customDomain?: string | null): string {
  if (isTracpost(siteSlug)) return "/blog/sitemap.xml";
  if (customDomain) return `https://${customDomain}/sitemap.xml`;
  return `/tenant/${siteSlug}/blog/sitemap.xml`;
}

// ──────────────────────────────────────────────────────────────────
// Projects
// ──────────────────────────────────────────────────────────────────

/** Hub URL — the projects landing page. */
export function projectsHubUrl(siteSlug: string, customDomain?: string | null): string {
  if (isTracpost(siteSlug)) return "/projects";
  if (customDomain) return `https://${projectsDomainOf(customDomain)}`;
  return `/tenant/${siteSlug}/projects`;
}

/** Project detail URL. */
export function projectUrl(
  siteSlug: string,
  projectSlug: string,
  customDomain?: string | null
): string {
  if (isTracpost(siteSlug)) return `/projects/${projectSlug}`;
  if (customDomain) return `https://${projectsDomainOf(customDomain)}/${projectSlug}`;
  return `/tenant/${siteSlug}/projects/${projectSlug}`;
}

/** Brand hub URL — list of all brands/materials. */
export function brandHubUrl(siteSlug: string, customDomain?: string | null): string {
  if (isTracpost(siteSlug)) return "/projects/brands";
  if (customDomain) return `https://${projectsDomainOf(customDomain)}/brands`;
  return `/tenant/${siteSlug}/projects/brands`;
}

/** Brand detail URL. */
export function brandUrl(
  siteSlug: string,
  brandSlug: string,
  customDomain?: string | null
): string {
  if (isTracpost(siteSlug)) return `/projects/brands/${brandSlug}`;
  if (customDomain) return `https://${projectsDomainOf(customDomain)}/brands/${brandSlug}`;
  return `/tenant/${siteSlug}/projects/brands/${brandSlug}`;
}

// ──────────────────────────────────────────────────────────────────
// Absolute (public) variants — for canonical, OG, sitemaps, emails
// ──────────────────────────────────────────────────────────────────

const TRACPOST_ORIGIN = "https://tracpost.com";
const STAGING_ORIGIN = "https://staging.tracpost.com";

function tenantOrigin(siteSlug: string): string {
  return isTracpost(siteSlug) ? TRACPOST_ORIGIN : STAGING_ORIGIN;
}

/** Absolute blog hub URL for canonical / OG / sitemap usage. */
export function publicBlogUrl(siteSlug: string, customDomain?: string | null): string {
  if (customDomain) return `https://${customDomain}`;
  if (isTracpost(siteSlug)) return `${TRACPOST_ORIGIN}/blog`;
  return `${STAGING_ORIGIN}/${siteSlug}/blog`;
}

/** Absolute blog article URL. */
export function publicBlogArticleUrl(
  siteSlug: string,
  articleSlug: string,
  customDomain?: string | null
): string {
  if (customDomain) return `https://${customDomain}/${articleSlug}`;
  if (isTracpost(siteSlug)) return `${TRACPOST_ORIGIN}/blog/${articleSlug}`;
  return `${STAGING_ORIGIN}/${siteSlug}/blog/${articleSlug}`;
}

/** Absolute projects hub URL. */
export function publicProjectsUrl(siteSlug: string, customDomain?: string | null): string {
  if (customDomain) return `https://${projectsDomainOf(customDomain)}`;
  if (isTracpost(siteSlug)) return `${TRACPOST_ORIGIN}/projects`;
  return `${STAGING_ORIGIN}/${siteSlug}/projects`;
}

/** Absolute project detail URL. */
export function publicProjectUrl(
  siteSlug: string,
  projectSlug: string,
  customDomain?: string | null
): string {
  if (customDomain) return `https://${projectsDomainOf(customDomain)}/${projectSlug}`;
  if (isTracpost(siteSlug)) return `${TRACPOST_ORIGIN}/projects/${projectSlug}`;
  return `${STAGING_ORIGIN}/${siteSlug}/projects/${projectSlug}`;
}

/** Absolute brand hub URL. */
export function publicBrandHubUrl(siteSlug: string, customDomain?: string | null): string {
  if (customDomain) return `https://${projectsDomainOf(customDomain)}/brands`;
  if (isTracpost(siteSlug)) return `${TRACPOST_ORIGIN}/projects/brands`;
  return `${STAGING_ORIGIN}/${siteSlug}/projects/brands`;
}

/** Absolute brand detail URL. */
export function publicBrandUrl(
  siteSlug: string,
  brandSlug: string,
  customDomain?: string | null
): string {
  if (customDomain) return `https://${projectsDomainOf(customDomain)}/brands/${brandSlug}`;
  if (isTracpost(siteSlug)) return `${TRACPOST_ORIGIN}/projects/brands/${brandSlug}`;
  return `${STAGING_ORIGIN}/${siteSlug}/projects/brands/${brandSlug}`;
}

/** Origin used as the base for absolute URLs in emails, sitemaps, etc. */
export function tenantPublicOrigin(
  siteSlug: string,
  customDomain?: string | null
): string {
  if (customDomain) return `https://${customDomain}`;
  return tenantOrigin(siteSlug);
}
