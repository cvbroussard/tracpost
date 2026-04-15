/**
 * About page data loader for a tenant's marketing site.
 */
import "server-only";
import { sql } from "@/lib/db";
import type { WebsiteCopy } from "@/lib/tenant-site/copy-generator";

export interface AboutPageData {
  aboutHero: string | null;
  headline: string;
  story: string; // HTML
  values: Array<{ title: string; description: string }>;
  stats: Array<{ value: string; label: string }>;
  brandsTitle: string;
  brands: Array<{ name: string; slug: string }>;
}

export async function loadAboutPage(siteId: string): Promise<AboutPageData> {
  const [site] = await sql`
    SELECT website_copy, hero_asset_id
    FROM sites WHERE id = ${siteId}
  `;

  const copy = (site?.website_copy as WebsiteCopy | null) || null;
  const aboutCopy = copy?.about;

  // About hero: second-best image (hero_asset_id is reserved for home)
  const heroAssetId = site?.hero_asset_id as string | null;
  const [aboutHeroRow] = await sql`
    SELECT storage_url FROM media_assets
    WHERE site_id = ${siteId}
      AND triage_status = 'triaged'
      AND media_type LIKE 'image%'
      ${heroAssetId ? sql`AND id != ${heroAssetId}` : sql``}
    ORDER BY quality_score DESC NULLS LAST
    OFFSET 1 LIMIT 1
  `;
  const aboutHero = aboutHeroRow?.storage_url ? String(aboutHeroRow.storage_url) : null;

  // Brands with enough evidence to be meaningful
  const brandRows = await sql`
    SELECT name, slug FROM brands
    WHERE site_id = ${siteId}
      AND (SELECT COUNT(*) FROM asset_brands ab WHERE ab.brand_id = brands.id) >= 2
    ORDER BY name
    LIMIT 20
  `;
  const brands = brandRows.map((b) => ({
    name: String(b.name),
    slug: String(b.slug),
  }));

  return {
    aboutHero,
    headline: aboutCopy?.headline || "About",
    story: aboutCopy?.story || "",
    values: aboutCopy?.values || [],
    stats: aboutCopy?.stats || [],
    brandsTitle: aboutCopy?.brandsTitle || "Brands We Work With",
    brands,
  };
}
