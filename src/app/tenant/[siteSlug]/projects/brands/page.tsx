import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { resolveBlogSiteBySlug, getCustomDomain, getFavicon } from "@/lib/blog";
import { sql } from "@/lib/db";
import BlogShell, { type BlogTheme, type NavLink } from "@/components/blog/blog-shell";
import { brandUrl, publicBrandHubUrl } from "@/lib/urls";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ siteSlug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { siteSlug } = await params;
  const site = await resolveBlogSiteBySlug(siteSlug);
  if (!site) return {};

  const title = `Materials & Equipment — ${site.siteName}`;
  const description = `Materials, equipment, and brands used by ${site.siteName}`;
  const customDomain = await getCustomDomain(site.siteId);
  const favicon = await getFavicon(site.siteId);
  const canonicalUrl = publicBrandHubUrl(siteSlug, customDomain);

  return {
    title,
    description,
    ...(favicon ? { icons: { icon: favicon } } : {}),
    alternates: { canonical: canonicalUrl },
    openGraph: { title, description, url: canonicalUrl, type: "website" },
  };
}

export default async function BrandsHubPage({ params }: Props) {
  const { siteSlug } = await params;
  const site = await resolveBlogSiteBySlug(siteSlug);
  if (!site) notFound();

  const [blogSettings, siteRow, logoAsset, brands] = await Promise.all([
    sql`SELECT nav_links, theme FROM blog_settings WHERE site_id = ${site.siteId}`,
    sql`SELECT url, location, brand_playbook, business_phone, business_email, business_logo FROM sites WHERE id = ${site.siteId}`,
    sql`
      SELECT storage_url FROM media_assets
      WHERE site_id = ${site.siteId}
        AND media_type LIKE 'image%'
        AND metadata->>'is_logo' = 'true'
      LIMIT 1
    `,
    sql`
      SELECT b.id, b.name, b.slug, b.url, b.description,
             (SELECT COUNT(*)::int FROM asset_brands ab WHERE ab.brand_id = b.id) AS asset_count,
             (SELECT COUNT(DISTINCT ap.project_id)::int
              FROM asset_brands ab2
              JOIN asset_projects ap ON ap.asset_id = ab2.asset_id
              WHERE ab2.brand_id = b.id) AS project_count,
             (SELECT ma.storage_url FROM asset_brands ab3
              JOIN media_assets ma ON ma.id = ab3.asset_id
              WHERE ab3.brand_id = b.id AND ma.media_type LIKE 'image%'
              ORDER BY ma.quality_score DESC NULLS LAST LIMIT 1
             ) AS cover_image
      FROM brands b
      WHERE b.site_id = ${site.siteId}
        AND (SELECT COUNT(*) FROM asset_brands ab WHERE ab.brand_id = b.id) >= 2
      ORDER BY (SELECT COUNT(*) FROM asset_brands ab WHERE ab.brand_id = b.id) DESC
    `,
  ]);

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
      <h1 className="bs-article-page-title" style={{ marginBottom: 8 }}>Materials &amp; Equipment</h1>
      <p style={{ fontSize: 15, color: "var(--bs-muted)", marginBottom: 32, lineHeight: 1.6 }}>
        The products and brands we trust on our projects.
      </p>

      {brands.length === 0 ? (
        <p style={{ padding: "48px 0", textAlign: "center", color: "var(--bs-muted)" }}>
          No materials documented yet.
        </p>
      ) : (
        <div className="br-grid">
          {brands.map((brand: Record<string, unknown>) => {
            const coverImage = brand.cover_image ? String(brand.cover_image) : null;
            const projCount = Number(brand.project_count) || 0;
            const assetCount = Number(brand.asset_count) || 0;
            return (
              <a
                key={String(brand.id)}
                href={brandUrl(siteSlug, String(brand.slug), customDomain)}
                className="br-card"
              >
                {coverImage ? (
                  <img src={coverImage} alt={String(brand.name)} className="br-card-img" />
                ) : (
                  <div className="br-card-img-empty" />
                )}
                <div className="br-card-info">
                  <h2 className="br-card-name">{String(brand.name)}</h2>
                  <div className="br-card-meta">
                    <span>{projCount} project{projCount !== 1 ? "s" : ""}</span>
                    <span>·</span>
                    <span>{assetCount} photos</span>
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: brandHubStyles }} />
    </BlogShell>
  );
}

const brandHubStyles = `
  .br-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
  }

  @media (max-width: 768px) {
    .br-grid { grid-template-columns: repeat(2, 1fr); }
  }

  @media (max-width: 480px) {
    .br-grid { grid-template-columns: 1fr; }
  }

  .br-card {
    display: block;
    text-decoration: none;
    color: inherit;
    border-radius: var(--bs-radius);
    overflow: hidden;
    border: 1px solid var(--bs-border);
    transition: box-shadow 0.2s, transform 0.2s;
  }

  .br-card:hover {
    box-shadow: 0 4px 20px rgba(0,0,0,0.08);
    transform: translateY(-2px);
  }

  .br-card-img {
    width: 100%;
    aspect-ratio: 4 / 3;
    object-fit: cover;
  }

  .br-card-img-empty {
    width: 100%;
    aspect-ratio: 4 / 3;
    background: color-mix(in srgb, var(--bs-primary) 5%, var(--bs-bg));
  }

  .br-card-info {
    padding: 12px;
  }

  .br-card-name {
    font-family: var(--bs-heading-font);
    font-size: 14px;
    font-weight: 600;
    color: var(--bs-primary);
    margin: 0 0 4px;
  }

  .br-card-meta {
    display: flex;
    gap: 6px;
    font-size: 11px;
    color: var(--bs-muted);
  }
`;
