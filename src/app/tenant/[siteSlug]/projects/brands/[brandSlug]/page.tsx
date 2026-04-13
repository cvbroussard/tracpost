import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { resolveBlogSiteBySlug, getCustomDomain, getFavicon } from "@/lib/blog";
import { sql } from "@/lib/db";
import BlogShell, { type BlogTheme, type NavLink } from "@/components/blog/blog-shell";
import {
  blogArticleUrl,
  brandHubUrl,
  brandUrl,
  projectUrl,
  publicBrandUrl,
  publicProjectUrl,
  publicBlogArticleUrl,
} from "@/lib/urls";

export const dynamic = "force-dynamic";

// Cache for 1 hour, revalidate in background
export const revalidate = 3600;

interface Props {
  params: Promise<{ siteSlug: string; brandSlug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { siteSlug, brandSlug } = await params;
  const site = await resolveBlogSiteBySlug(siteSlug);
  if (!site) return {};

  const [brand] = await sql`
    SELECT name, description FROM brands
    WHERE site_id = ${site.siteId} AND slug = ${brandSlug}
  `;
  if (!brand) return {};

  const title = `${brand.name} — ${site.siteName}`;
  const description = (brand.description as string)
    || `See how ${site.siteName} uses ${brand.name} in their projects`;
  const customDomain = await getCustomDomain(site.siteId);
  const favicon = await getFavicon(site.siteId);
  const canonicalUrl = publicBrandUrl(siteSlug, brandSlug, customDomain);

  return {
    title,
    description,
    ...(favicon ? { icons: { icon: favicon } } : {}),
    alternates: { canonical: canonicalUrl },
    openGraph: { title, description, url: canonicalUrl, type: "article" },
  };
}

export default async function BrandDetailPage({ params }: Props) {
  const { siteSlug, brandSlug } = await params;
  const site = await resolveBlogSiteBySlug(siteSlug);
  if (!site) notFound();

  const [brand] = await sql`
    SELECT id, name, slug, url, description
    FROM brands
    WHERE site_id = ${site.siteId} AND slug = ${brandSlug}
  `;
  if (!brand) notFound();

  const brandId = brand.id as string;

  // Parallel data fetches
  const [
    projects, articles, assets, otherBrands,
    blogSettings, siteRow, logoAsset,
  ] = await Promise.all([
    // Projects using this brand
    sql`
      SELECT DISTINCT p.id, p.name, p.slug, p.description, p.start_date,
             (SELECT COUNT(*)::int FROM asset_brands ab
              JOIN asset_projects ap ON ap.asset_id = ab.asset_id
              WHERE ab.brand_id = ${brandId} AND ap.project_id = p.id) AS brand_photo_count,
             (SELECT ma.storage_url FROM asset_projects ap2
              JOIN media_assets ma ON ma.id = ap2.asset_id
              WHERE ap2.project_id = p.id AND ma.media_type LIKE 'image%'
              ORDER BY ma.quality_score DESC NULLS LAST LIMIT 1
             ) AS cover_image
      FROM projects p
      JOIN asset_projects ap ON ap.project_id = p.id
      JOIN asset_brands ab ON ab.asset_id = ap.asset_id
      WHERE ab.brand_id = ${brandId}
      ORDER BY p.start_date DESC NULLS LAST
    `,
    // Blog articles mentioning this brand
    sql`
      SELECT id, title, slug, excerpt, og_image_url, published_at
      FROM blog_posts
      WHERE site_id = ${site.siteId}
        AND status = 'published'
        AND body ILIKE ${"%" + String(brand.name) + "%"}
      ORDER BY published_at DESC
      LIMIT 10
    `,
    // Assets tagged with this brand
    sql`
      SELECT ma.id, ma.storage_url, ma.context_note, ma.quality_score
      FROM media_assets ma
      JOIN asset_brands ab ON ab.asset_id = ma.id
      WHERE ab.brand_id = ${brandId}
        AND ma.media_type LIKE 'image%'
        AND ma.triage_status = 'triaged'
      ORDER BY ma.quality_score DESC NULLS LAST
      LIMIT 12
    `,
    // Other brands for "also used" nav
    sql`
      SELECT b.name, b.slug,
             (SELECT COUNT(*)::int FROM asset_brands ab WHERE ab.brand_id = b.id) AS asset_count
      FROM brands b
      WHERE b.site_id = ${site.siteId}
        AND b.id != ${brandId}
        AND (SELECT COUNT(*) FROM asset_brands ab WHERE ab.brand_id = b.id) >= 2
      ORDER BY (SELECT COUNT(*) FROM asset_brands ab WHERE ab.brand_id = b.id) DESC
      LIMIT 8
    `,
    sql`SELECT nav_links, theme FROM blog_settings WHERE site_id = ${site.siteId}`,
    sql`SELECT url, location, brand_playbook, business_phone, business_email, business_logo FROM sites WHERE id = ${site.siteId}`,
    sql`
      SELECT storage_url FROM media_assets
      WHERE site_id = ${site.siteId}
        AND media_type LIKE 'image%'
        AND metadata->>'is_logo' = 'true'
      LIMIT 1
    `,
  ]);

  // Shell setup
  const settings = blogSettings[0] || {};
  const siteInfo = siteRow[0] || {};
  const websiteUrl = (siteInfo.url as string) || null;
  const logoUrl = (logoAsset[0]?.storage_url as string) || null;
  const siteLocation = (siteInfo.location as string) || null;

  const businessLogo = (siteInfo.business_logo as string) || null;
  const businessPhone = (siteInfo.business_phone as string) || null;
  const rawTheme = (settings.theme as Record<string, string>) || {};
  const theme: BlogTheme = { ...rawTheme, logoUrl: businessLogo || logoUrl || rawTheme.logoUrl };

  const storedNavLinks = (settings.nav_links as NavLink[]) || [];
  const navLinks: NavLink[] = storedNavLinks.length > 0
    ? storedNavLinks
    : [...(websiteUrl ? [{ label: "Home", href: websiteUrl }] : [])];

  const playbook = siteInfo.brand_playbook as Record<string, unknown> | null;
  const angles = (playbook?.brandPositioning as Record<string, unknown>)?.selectedAngles;
  const tagline = Array.isArray(angles) && angles[0]
    ? String((angles[0] as Record<string, unknown>).tagline || "")
    : "";

  const customDomain = await getCustomDomain(site.siteId);

  // Generate description if missing
  const brandDescription = (brand.description as string) || null;

  // Hero — best quality asset tagged with this brand
  const heroUrl = assets[0]?.storage_url ? String(assets[0].storage_url) : null;

  return (
    <BlogShell
      siteName={site.siteName}
      siteSlug={siteSlug}
      customDomain={customDomain}
      tagline={tagline}
      navLinks={navLinks}
      theme={theme}
      location={siteLocation}
      phone={businessPhone}
      websiteUrl={websiteUrl}
    >
      {/* JSON-LD Schema — Brand/Product with local business context */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Product",
          name: String(brand.name),
          description: brandDescription || `${String(brand.name)} used by ${site.siteName}`,
          ...(brand.url ? { url: String(brand.url) } : {}),
          ...(heroUrl ? { image: heroUrl } : {}),
          brand: {
            "@type": "Brand",
            name: String(brand.name),
            ...(brand.url ? { url: String(brand.url) } : {}),
          },
          provider: {
            "@type": "LocalBusiness",
            name: site.siteName,
            ...(websiteUrl ? { url: websiteUrl } : {}),
            ...(siteLocation ? { address: { "@type": "PostalAddress", addressLocality: siteLocation } } : {}),
          },
          ...(projects.length > 0 ? {
            subjectOf: projects.map((p: Record<string, unknown>) => ({
              "@type": "CreativeWork",
              name: String(p.name),
              url: publicProjectUrl(siteSlug, String(p.slug), customDomain),
            })),
          } : {}),
          ...(articles.length > 0 ? {
            mentions: articles.map((a: Record<string, unknown>) => ({
              "@type": "Article",
              name: String(a.title),
              url: publicBlogArticleUrl(siteSlug, String(a.slug), customDomain),
            })),
          } : {}),
        }) }}
      />

      {/* Hero */}
      {heroUrl && (
        <img src={heroUrl} alt={String(brand.name)} className="br-hero" />
      )}

      {/* Header */}
      <header className="br-header">
        <a href={brandHubUrl(siteSlug, customDomain)} className="br-back">&larr; All Materials</a>
        <h1 className="bs-article-page-title">{String(brand.name)}</h1>
        {brandDescription && (
          <p className="br-desc">{brandDescription}</p>
        )}
        <div className="br-links">
          {brand.url && (
            <a href={String(brand.url)} target="_blank" rel="noopener noreferrer" className="br-ext-link">
              Visit website &rarr;
            </a>
          )}
        </div>
      </header>

      {/* Projects using this brand */}
      {projects.length > 0 && (
        <section className="br-section">
          <h2 className="br-section-title">
            Featured in {projects.length} Project{projects.length !== 1 ? "s" : ""}
          </h2>
          <div className="br-project-list">
            {projects.map((p: Record<string, unknown>) => {
              const cover = p.cover_image ? String(p.cover_image) : null;
              const count = Number(p.brand_photo_count) || 0;
              return (
                <a
                  key={String(p.id)}
                  href={projectUrl(siteSlug, String(p.slug), customDomain)}
                  className="br-project-item"
                >
                  {cover && (
                    <img src={cover} alt={String(p.name)} className="br-project-thumb" />
                  )}
                  <div>
                    <span className="br-project-name">{String(p.name)}</span>
                    <span className="br-project-count">
                      {count} photo{count !== 1 ? "s" : ""} with {String(brand.name)}
                    </span>
                  </div>
                </a>
              );
            })}
          </div>
        </section>
      )}

      {/* Related articles */}
      {articles.length > 0 && (
        <section className="br-section">
          <h2 className="br-section-title">
            Mentioned in {articles.length} Article{articles.length !== 1 ? "s" : ""}
          </h2>
          <div className="br-article-list">
            {articles.map((a: Record<string, unknown>) => {
              const ogImg = a.og_image_url ? String(a.og_image_url) : null;
              const pubDate = a.published_at ? String(a.published_at) : null;
              return (
                <a
                  key={String(a.id)}
                  href={blogArticleUrl(siteSlug, String(a.slug), customDomain)}
                  className="br-article-item"
                >
                  {ogImg && (
                    <img src={ogImg} alt={String(a.title)} className="br-article-thumb" />
                  )}
                  <div>
                    <span className="br-article-title">{String(a.title)}</span>
                    {pubDate && (
                      <span className="br-article-date">
                        {new Date(pubDate).toLocaleDateString("en-US", {
                          year: "numeric", month: "short", day: "numeric",
                        })}
                      </span>
                    )}
                  </div>
                </a>
              );
            })}
          </div>
        </section>
      )}

      {/* Photo gallery */}
      {assets.length > 0 && (
        <section className="br-section">
          <h2 className="br-section-title">Photos featuring {String(brand.name)}</h2>
          <div className="br-gallery">
            {assets.map((a: Record<string, unknown>) => {
              const caption = a.context_note ? String(a.context_note) : null;
              return (
                <div key={String(a.id)} className="br-gallery-item">
                  <img src={String(a.storage_url)} alt={caption || ""} loading="lazy" />
                  {caption && (
                    <p className="br-gallery-caption">{caption}</p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Other brands */}
      {otherBrands.length > 0 && (
        <section className="br-section">
          <h2 className="br-section-title">Also Used</h2>
          <div className="br-other-brands">
            {otherBrands.map((b: Record<string, unknown>) => (
              <a
                key={String(b.slug)}
                href={brandUrl(siteSlug, String(b.slug), customDomain)}
                className="br-other-chip"
              >
                {String(b.name)}
              </a>
            ))}
          </div>
        </section>
      )}

      <style dangerouslySetInnerHTML={{ __html: brandDetailStyles }} />
    </BlogShell>
  );
}

const brandDetailStyles = `
  .br-hero {
    width: 100%;
    aspect-ratio: 16 / 9;
    object-fit: cover;
    border-radius: var(--bs-radius);
    margin-bottom: 24px;
  }

  .br-header {
    margin-bottom: 40px;
    padding-bottom: 24px;
    border-bottom: 1px solid var(--bs-border);
  }

  .br-back {
    display: inline-block;
    font-size: 13px;
    color: var(--bs-muted);
    text-decoration: none;
    margin-bottom: 16px;
  }

  .br-back:hover { color: var(--bs-accent); }

  .br-desc {
    font-size: 17px;
    line-height: 1.6;
    color: var(--bs-muted);
    margin: 12px 0 16px;
  }

  .br-links {
    display: flex;
    gap: 16px;
  }

  .br-ext-link {
    font-size: 14px;
    color: var(--bs-accent);
    text-decoration: none;
    font-weight: 500;
  }

  .br-ext-link:hover { text-decoration: underline; }

  /* Sections */
  .br-section {
    margin-bottom: 40px;
  }

  .br-section-title {
    font-family: var(--bs-heading-font);
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--bs-muted);
    margin-bottom: 16px;
    padding-bottom: 8px;
    border-bottom: 2px solid var(--bs-accent);
  }

  /* Project list */
  .br-project-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .br-project-item {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 12px;
    border-radius: var(--bs-radius);
    border: 1px solid var(--bs-border);
    text-decoration: none;
    color: inherit;
    transition: box-shadow 0.15s;
  }

  .br-project-item:hover {
    box-shadow: 0 2px 12px rgba(0,0,0,0.06);
  }

  .br-project-thumb {
    width: 80px;
    height: 56px;
    object-fit: cover;
    border-radius: calc(var(--bs-radius) / 2);
    flex-shrink: 0;
  }

  .br-project-name {
    display: block;
    font-size: 15px;
    font-weight: 600;
    color: var(--bs-primary);
    line-height: 1.3;
  }

  .br-project-count {
    display: block;
    font-size: 12px;
    color: var(--bs-muted);
    margin-top: 2px;
  }

  /* Article list */
  .br-article-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .br-article-item {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 12px;
    border-radius: var(--bs-radius);
    border: 1px solid var(--bs-border);
    text-decoration: none;
    color: inherit;
    transition: box-shadow 0.15s;
  }

  .br-article-item:hover {
    box-shadow: 0 2px 12px rgba(0,0,0,0.06);
  }

  .br-article-thumb {
    width: 80px;
    height: 56px;
    object-fit: cover;
    border-radius: calc(var(--bs-radius) / 2);
    flex-shrink: 0;
  }

  .br-article-title {
    display: block;
    font-size: 15px;
    font-weight: 500;
    color: var(--bs-primary);
    line-height: 1.4;
  }

  .br-article-date {
    display: block;
    font-size: 12px;
    color: var(--bs-muted);
    margin-top: 2px;
  }

  /* Photo gallery */
  .br-gallery {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
  }

  @media (max-width: 640px) {
    .br-gallery { grid-template-columns: repeat(2, 1fr); }
  }

  .br-gallery-item {
    border-radius: var(--bs-radius);
    overflow: hidden;
    border: 1px solid var(--bs-border);
  }

  .br-gallery-item img {
    width: 100%;
    aspect-ratio: 1;
    object-fit: cover;
    display: block;
  }

  .br-gallery-caption {
    font-size: 12px;
    line-height: 1.5;
    color: var(--bs-muted);
    padding: 8px 10px;
    margin: 0;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  /* Other brands */
  .br-other-brands {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .br-other-chip {
    font-size: 13px;
    padding: 6px 14px;
    border-radius: var(--bs-radius);
    border: 1px solid var(--bs-border);
    color: var(--bs-text);
    text-decoration: none;
    transition: all 0.15s;
  }

  .br-other-chip:hover {
    border-color: var(--bs-accent);
    color: var(--bs-accent);
  }
`;
