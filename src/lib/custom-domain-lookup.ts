/**
 * Edge-runtime-compatible lookup: given a hostname, return the tenant
 * siteSlug if that hostname is a registered custom domain. Used by
 * middleware to resolve root custom domains (e.g. "epicuriouskitchens.com")
 * to their tenant slug.
 *
 * Strips `www.` prefix for matching — `www.epicuriouskitchens.com` and
 * `epicuriouskitchens.com` resolve to the same tenant.
 *
 * Returns null if no match (unknown hostname; middleware treats as
 * misconfigured CNAME and redirects to /unauthorized).
 */
import { neon } from "@neondatabase/serverless";

export async function lookupTenantByCustomDomain(hostname: string): Promise<string | null> {
  if (!process.env.DATABASE_URL) return null;

  const normalized = hostname.toLowerCase().split(":")[0].replace(/^www\./, "");
  if (!normalized) return null;

  const sql = neon(process.env.DATABASE_URL);
  const rows = await sql`
    SELECT s.blog_slug
    FROM blog_settings bs
    JOIN businesses s ON s.id = bs.business_id
    WHERE bs.custom_domain = ${normalized}
      AND s.is_active = true
    LIMIT 1
  `;

  const slug = rows[0]?.blog_slug;
  return slug ? String(slug) : null;
}

/**
 * Inverse lookup: given a siteSlug, return the custom_domain if set.
 * Used by middleware on preview subdomain to decide whether to 301
 * to a post-cutover production domain.
 */
export async function lookupCustomDomainBySlug(siteSlug: string): Promise<string | null> {
  if (!process.env.DATABASE_URL) return null;

  const sql = neon(process.env.DATABASE_URL);
  const rows = await sql`
    SELECT bs.custom_domain
    FROM blog_settings bs
    JOIN businesses s ON s.id = bs.business_id
    WHERE s.blog_slug = ${siteSlug}
      AND s.is_active = true
    LIMIT 1
  `;

  const domain = rows[0]?.custom_domain;
  return domain ? String(domain) : null;
}
