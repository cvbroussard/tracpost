/**
 * Home page data loader for a tenant's marketing site.
 * Reads cached copy from sites.website_copy (or falls back to minimal
 * placeholder), pulls hero asset (override first, then scored), pulls
 * gallery images + recent blog articles for the gallery/articles strip.
 */
import "server-only";
import { sql } from "@/lib/db";
import type { WebsiteCopy } from "@/lib/tenant-site/copy-generator";

export interface HomePageData {
  heroImage: string | null;
  heroTitle: string;
  heroSubtitle: string;
  ctaText: string;
  servicesTitle: string;
  servicesSubtitle: string;
  services: Array<{ title: string; description: string; image?: string }>;
  galleryTitle: string;
  gallerySubtitle: string;
  galleryImages: Array<{ url: string; alt: string }>;
  recentArticles: Array<{
    title: string;
    slug: string;
    excerpt: string | null;
    image: string | null;
    date: string | null;
  }>;
}

export async function loadHomePage(siteId: string): Promise<HomePageData> {
  const [site] = await sql`
    SELECT website_copy, hero_asset_id, business_type, location
    FROM sites WHERE id = ${siteId}
  `;

  if (!site) {
    return emptyHome();
  }

  const copy = (site.website_copy as WebsiteCopy | null) || null;
  const homeCopy = copy?.home;

  // Hero: pinned override first, else highest-scored image asset
  const heroAssetId = site.hero_asset_id as string | null;
  const heroImage = await resolveHeroImage(siteId, heroAssetId);

  // Gallery: top image assets (excluding hero)
  const galleryAssets = await sql`
    SELECT storage_url, context_note
    FROM media_assets
    WHERE site_id = ${siteId}
      AND triage_status = 'triaged'
      AND media_type LIKE 'image%'
      ${heroAssetId ? sql`AND id != ${heroAssetId}` : sql``}
    ORDER BY quality_score DESC NULLS LAST
    LIMIT 9
  `;

  const galleryImages = galleryAssets.map((a) => ({
    url: String(a.storage_url),
    alt: a.context_note ? String(a.context_note).slice(0, 100) : "",
  }));

  // Recent articles for the home gallery strip
  const articles = await sql`
    SELECT title, slug, excerpt, og_image_url, published_at
    FROM blog_posts
    WHERE site_id = ${siteId} AND status = 'published'
    ORDER BY published_at DESC
    LIMIT 3
  `;

  const recentArticles = articles.map((a) => ({
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
  }));

  // Copy: use generated copy if present, otherwise minimal placeholder
  // derived from the site row so the page still renders meaningfully.
  const fallbackTitle = `Welcome to ${(site.business_type as string) || "our site"}`;
  const fallbackSubtitle = `${(site.business_type as string) || ""}${
    site.location ? ` in ${site.location}` : ""
  }`.trim();

  return {
    heroImage,
    heroTitle: homeCopy?.heroTitle || fallbackTitle,
    heroSubtitle: homeCopy?.heroSubtitle || fallbackSubtitle,
    ctaText: homeCopy?.ctaText || "Get Started",
    servicesTitle: homeCopy?.servicesTitle || "What We Do",
    servicesSubtitle: homeCopy?.servicesSubtitle || "",
    services: homeCopy?.services || [],
    galleryTitle: homeCopy?.galleryTitle || "Recent Work",
    gallerySubtitle: homeCopy?.gallerySubtitle || "",
    galleryImages,
    recentArticles,
  };
}

/**
 * Resolve the hero image for a site. Respects the hero_asset_id
 * override; falls back to highest-scored image asset if null or missing.
 */
async function resolveHeroImage(
  siteId: string,
  heroAssetId: string | null,
): Promise<string | null> {
  if (heroAssetId) {
    const [pinned] = await sql`
      SELECT storage_url FROM media_assets
      WHERE id = ${heroAssetId} AND site_id = ${siteId}
    `;
    if (pinned?.storage_url) return String(pinned.storage_url);
    // Fall through if the pinned asset was deleted (FK is ON DELETE SET NULL)
  }

  const [top] = await sql`
    SELECT storage_url FROM media_assets
    WHERE site_id = ${siteId}
      AND triage_status = 'triaged'
      AND media_type LIKE 'image%'
    ORDER BY quality_score DESC NULLS LAST
    LIMIT 1
  `;
  return top?.storage_url ? String(top.storage_url) : null;
}

function emptyHome(): HomePageData {
  return {
    heroImage: null,
    heroTitle: "",
    heroSubtitle: "",
    ctaText: "Contact",
    servicesTitle: "",
    servicesSubtitle: "",
    services: [],
    galleryTitle: "",
    gallerySubtitle: "",
    galleryImages: [],
    recentArticles: [],
  };
}
