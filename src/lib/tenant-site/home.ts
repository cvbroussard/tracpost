/**
 * Home page data loader for a tenant's marketing site.
 *
 * Phase 1.5 (2026-06-16) — hybrid render: prefers the new catalog-driven
 * website_content (published row) for sections the v2 generator has
 * produced; falls back to the legacy website_copy JSONB for sections
 * not yet generated. Allows phased adoption per section type — hero
 * ships first, services/projects/etc. follow.
 *
 * Pulls hero asset (website_content > pinned hero_asset_id > scored),
 * gallery images + recent blog articles for the gallery/articles strip.
 */
import "server-only";
import { sql } from "@/lib/db";
import type { WebsiteCopy } from "@/lib/tenant-site/copy-generator";
import type { PageContent, HeroSection } from "@/lib/website-gen/types";

export interface HomePageData {
  heroImage: string | null;
  heroTagline: string | null;
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
    SELECT website_copy, hero_asset_id, business_type, location, tagline
    FROM businesses WHERE id = ${siteId}
  `;

  if (!site) {
    return emptyHome();
  }

  const copy = (site.website_copy as WebsiteCopy | null) || null;
  const homeCopy = copy?.home;

  // Phase 1.5 — catalog-driven override layer. When a published
  // website_content row exists for this page, its hero section takes
  // precedence over website_copy + asset-resolution fallback.
  const [publishedRow] = await sql`
    SELECT content
    FROM website_content
    WHERE business_id = ${siteId}
      AND page_key = 'home'
      AND status = 'published'
    LIMIT 1
  `;
  const generatedContent = publishedRow?.content as PageContent | undefined;
  const generatedHero = generatedContent?.sections.find(
    (s) => s.type === "hero",
  ) as HeroSection | undefined;

  // Hero: generated > pinned override > highest-scored asset
  const heroAssetId = site.hero_asset_id as string | null;
  const heroImage = generatedHero?.hero_image?.url
    ?? (await resolveHeroImage(siteId, heroAssetId));

  // Gallery: top image assets (excluding hero)
  const galleryAssets = await sql`
    SELECT storage_url, context_note
    FROM media_assets
    WHERE business_id = ${siteId}
      AND processing_stage = 'briefed'
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
    WHERE business_id = ${siteId} AND status = 'published'
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

  // Copy: precedence order is generated catalog-driven content >
  // legacy website_copy > minimal placeholder from the site row.
  const fallbackTitle = `Welcome to ${(site.business_type as string) || "our site"}`;
  const fallbackSubtitle = `${(site.business_type as string) || ""}${
    site.location ? ` in ${site.location}` : ""
  }`.trim();

  // Hero copy from generated content if available. Tagline is the
  // canonical brand statement — surfaced as its own slot (not folded
  // into subhead) per closed-loop layer-stack doctrine; if PPA can't
  // see it on the rendered page, the catalog value is effectively
  // lost in translation.
  const heroTagline =
    generatedHero?.tagline
    ?? (site.tagline ? String(site.tagline) : null);
  const heroTitle =
    generatedHero?.headline
    ?? homeCopy?.heroTitle
    ?? fallbackTitle;
  const heroSubtitle =
    generatedHero?.subhead
    ?? homeCopy?.heroSubtitle
    ?? fallbackSubtitle;
  const ctaText =
    generatedHero?.primary_cta?.text
    ?? homeCopy?.ctaText
    ?? "Get Started";

  return {
    heroImage,
    heroTagline,
    heroTitle,
    heroSubtitle,
    ctaText,
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
      WHERE id = ${heroAssetId} AND business_id = ${siteId}
    `;
    if (pinned?.storage_url) return String(pinned.storage_url);
    // Fall through if the pinned asset was deleted (FK is ON DELETE SET NULL)
  }

  const [top] = await sql`
    SELECT storage_url FROM media_assets
    WHERE business_id = ${siteId}
      AND processing_stage = 'briefed'
      AND media_type LIKE 'image%'
    ORDER BY quality_score DESC NULLS LAST
    LIMIT 1
  `;
  return top?.storage_url ? String(top.storage_url) : null;
}

function emptyHome(): HomePageData {
  return {
    heroImage: null,
    heroTagline: null,
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
