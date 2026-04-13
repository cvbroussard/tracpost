import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { resolveBlogSiteBySlug, getCustomDomain, getFavicon } from "@/lib/blog";
import { sql } from "@/lib/db";
import BlogShell, { type BlogTheme, type NavLink } from "@/components/blog/blog-shell";
import { ProjectDetailAside } from "@/components/blog/project-aside";
import { projectsHubUrl, projectUrl, brandHubUrl, publicProjectUrl } from "@/lib/urls";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ siteSlug: string; projectSlug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { siteSlug, projectSlug } = await params;
  const site = await resolveBlogSiteBySlug(siteSlug);
  if (!site) return {};

  const [project] = await sql`
    SELECT name, description FROM projects
    WHERE site_id = ${site.siteId} AND slug = ${projectSlug}
  `;
  if (!project) return {};

  const title = `${project.name} — ${site.siteName}`;
  const description = (project.description as string) || `${project.name} by ${site.siteName}`;
  const customDomain = await getCustomDomain(site.siteId);
  const favicon = await getFavicon(site.siteId);
  const canonicalUrl = publicProjectUrl(siteSlug, projectSlug, customDomain);

  return {
    title,
    description,
    ...(favicon ? { icons: { icon: favicon } } : {}),
    alternates: { canonical: canonicalUrl },
    openGraph: { title, description, url: canonicalUrl, type: "article" },
  };
}

export default async function ProjectPage({ params }: Props) {
  const { siteSlug, projectSlug } = await params;
  const site = await resolveBlogSiteBySlug(siteSlug);
  if (!site) notFound();

  const [project] = await sql`
    SELECT id, name, slug, description, address, start_date, end_date, status
    FROM projects
    WHERE site_id = ${site.siteId} AND slug = ${projectSlug}
  `;
  if (!project) notFound();

  const projectId = project.id as string;

  const [assets, brands, personas, locationRows, blogSettings, siteRow, logoAsset, siblingProjects] = await Promise.all([
    sql`
      SELECT ma.id, ma.storage_url, ma.media_type, ma.context_note,
             ma.date_taken, ma.created_at, ma.quality_score
      FROM media_assets ma
      JOIN asset_projects ap ON ap.asset_id = ma.id
      WHERE ap.project_id = ${projectId}
        AND ma.triage_status = 'triaged'
      ORDER BY ma.sort_order ASC NULLS LAST
    `,
    sql`
      SELECT DISTINCT b.id, b.name, b.slug, b.url
      FROM brands b
      JOIN asset_brands ab ON ab.brand_id = b.id
      JOIN asset_projects ap ON ap.asset_id = ab.asset_id
      WHERE ap.project_id = ${projectId}
      ORDER BY b.name
    `,
    sql`
      SELECT DISTINCT p.id, p.name, p.display_name, p.type, p.consent_given
      FROM personas p
      JOIN asset_personas ap ON ap.persona_id = p.id
      JOIN asset_projects aproj ON aproj.asset_id = ap.asset_id
      WHERE aproj.project_id = ${projectId}
    `,
    sql`
      SELECT DISTINCT l.name, l.city, l.state
      FROM locations l
      JOIN asset_locations al ON al.location_id = l.id
      JOIN asset_projects ap ON ap.asset_id = al.asset_id
      WHERE ap.project_id = ${projectId}
      LIMIT 1
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
    sql`
      SELECT p.id, p.name, p.slug,
             (SELECT ma.storage_url FROM asset_projects ap2
              JOIN media_assets ma ON ma.id = ap2.asset_id
              WHERE ap2.project_id = p.id AND ma.media_type LIKE 'image%'
              ORDER BY ma.quality_score DESC NULLS LAST LIMIT 1
             ) AS cover_image
      FROM projects p
      WHERE p.site_id = ${site.siteId}
        AND (SELECT COUNT(*) FROM asset_projects ap WHERE ap.project_id = p.id) >= 3
      ORDER BY p.start_date DESC NULLS LAST
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
    : [
        ...(websiteUrl ? [{ label: "Home", href: websiteUrl }] : []),
      ];

  const customDomain = await getCustomDomain(site.siteId);

  const playbook = siteInfo.brand_playbook as Record<string, unknown> | null;
  const angles = (playbook?.brandPositioning as Record<string, unknown>)?.selectedAngles;
  const tagline = Array.isArray(angles) && angles[0]
    ? String((angles[0] as Record<string, unknown>).tagline || "")
    : "";

  // Project data
  const location = locationRows[0] || null;
  const startDate = project.start_date
    ? new Date(project.start_date as string).toLocaleDateString("en-US", { year: "numeric", month: "long" })
    : null;
  const endDate = project.end_date
    ? new Date(project.end_date as string).toLocaleDateString("en-US", { year: "numeric", month: "long" })
    : null;

  // Hero — highest quality asset (skip first few for variety if gallery is large)
  const sortedByQuality = [...assets].sort((a, b) =>
    (Number(b.quality_score) || 0) - (Number(a.quality_score) || 0)
  );
  const heroUrl = sortedByQuality[0]?.storage_url ? String(sortedByQuality[0].storage_url) : null;

  // Group assets by month
  const timeline = new Map<string, { id: string; assets: Array<Record<string, unknown>> }>();
  for (const asset of assets) {
    const date = asset.date_taken || asset.created_at;
    const month = date
      ? new Date(date as string).toLocaleDateString("en-US", { year: "numeric", month: "long" })
      : "Undated";
    if (!timeline.has(month)) {
      const id = month.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      timeline.set(month, { id, assets: [] });
    }
    timeline.get(month)!.assets.push(asset);
  }

  // Build aside data
  const locationStr = location
    ? [location.city, location.state].filter(Boolean).join(", ")
    : null;

  const monthNav = Array.from(timeline.entries()).map(([label, { id, assets: a }]) => ({
    id,
    label,
    count: a.length,
  }));

  const asideBrands = brands.map((b: Record<string, unknown>) => ({
    id: String(b.id),
    name: String(b.name),
    slug: String(b.slug),
    url: b.url ? String(b.url) : null,
  }));

  const asidePersonas = personas
    .filter((p: Record<string, unknown>) => p.consent_given)
    .map((p: Record<string, unknown>) => ({
      id: String(p.id),
      name: String(p.name),
      type: String(p.type),
    }));

  // Prev/next project navigation
  const projectList = siblingProjects.map((p: Record<string, unknown>) => ({
    slug: String(p.slug),
    name: String(p.name),
    coverImage: p.cover_image ? String(p.cover_image) : null,
  }));
  const currentIndex = projectList.findIndex((p) => p.slug === projectSlug);
  const prevProject = currentIndex > 0 ? projectList[currentIndex - 1] : null;
  const nextProject = currentIndex < projectList.length - 1 ? projectList[currentIndex + 1] : null;

  // Build sibling hrefs using custom domain if available
  const projectsBase = projectsHubUrl(siteSlug, customDomain);
  const brandsBase = brandHubUrl(siteSlug, customDomain);

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
      aside={
        <ProjectDetailAside
          meta={{
            startDate,
            endDate,
            location: locationStr,
            photoCount: assets.length,
            status: String(project.status || "active"),
          }}
          months={monthNav}
          brands={asideBrands}
          brandsBaseUrl={brandsBase}
          personas={asidePersonas}
          prev={prevProject ? { ...prevProject, slug: projectUrl(siteSlug, prevProject.slug, customDomain) } : null}
          next={nextProject ? { ...nextProject, slug: projectUrl(siteSlug, nextProject.slug, customDomain) } : null}
        />
      }
    >
      {/* Hero with overlay */}
      {heroUrl && (
        <div className="pj-hero">
          <img src={heroUrl} alt={String(project.name)} className="pj-hero-img" />
          <div className="pj-hero-overlay">
            <h1 className="pj-hero-title">{String(project.name)}</h1>
            {project.description && (
              <p className="pj-hero-desc">{String(project.description)}</p>
            )}
          </div>
        </div>
      )}

      {/* Overview bar */}
      <div className="pj-overview">
        <a href={projectsBase} className="pj-back">
          &larr; All Projects
        </a>
        <div className="pj-overview-stats">
          {startDate && (
            <div className="pj-stat">
              <span className="pj-stat-label">Timeline</span>
              <span className="pj-stat-value">
                {startDate}{endDate && endDate !== startDate ? ` — ${endDate}` : ""}
              </span>
            </div>
          )}
          {(location?.city || location?.state) && (
            <div className="pj-stat">
              <span className="pj-stat-label">Location</span>
              <span className="pj-stat-value">
                {[location.city, location.state].filter(Boolean).join(", ")}
              </span>
            </div>
          )}
          <div className="pj-stat">
            <span className="pj-stat-label">Documentation</span>
            <span className="pj-stat-value">{assets.length} photos</span>
          </div>
          {brands.length > 0 && (
            <div className="pj-stat">
              <span className="pj-stat-label">Materials</span>
              <span className="pj-stat-value">{brands.length} suppliers</span>
            </div>
          )}
        </div>
      </div>

      {/* Timeline sections */}
      {Array.from(timeline.entries()).map(([month, { id, assets: monthAssets }]) => {
        const captioned = monthAssets.filter((a) => a.context_note);
        const uncaptioned = monthAssets.filter((a) => !a.context_note);

        return (
          <section key={month} id={id} className="pj-month">
            <h2 className="pj-month-title">{month}</h2>

            {/* Featured moments — captioned assets in two-column layout */}
            {captioned.map((asset) => {
              const isVideo = (asset.media_type as string) === "video";
              const caption = String(asset.context_note);
              const dateTaken = asset.date_taken
                ? new Date(asset.date_taken as string).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                : null;

              return (
                <div key={String(asset.id)} className="pj-featured">
                  <div className="pj-featured-media">
                    {isVideo ? (
                      <video src={String(asset.storage_url)} controls preload="metadata" />
                    ) : (
                      <img src={String(asset.storage_url)} alt={caption} loading="lazy" />
                    )}
                  </div>
                  <div className="pj-featured-text">
                    <p className="pj-featured-caption">{caption}</p>
                    {dateTaken && <span className="pj-featured-date">{dateTaken}</span>}
                  </div>
                </div>
              );
            })}

            {/* Gallery grid — uncaptioned assets */}
            {uncaptioned.length > 0 && (
              <div className="pj-gallery">
                {uncaptioned.map((asset) => (
                  <div key={String(asset.id)} className="pj-gallery-item">
                    {(asset.media_type as string) === "video" ? (
                      <video src={String(asset.storage_url)} controls preload="metadata" />
                    ) : (
                      <img src={String(asset.storage_url)} alt="" loading="lazy" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}

      <style dangerouslySetInnerHTML={{ __html: projectStyles }} />
    </BlogShell>
  );
}

const projectStyles = `
  /* Hero with text overlay */
  .pj-hero {
    position: relative;
    border-radius: var(--bs-radius);
    overflow: hidden;
    margin-bottom: 0;
  }

  .pj-hero-img {
    width: 100%;
    aspect-ratio: 16 / 9;
    object-fit: cover;
    display: block;
  }

  .pj-hero-overlay {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 40px 32px 28px;
    background: linear-gradient(transparent, rgba(0,0,0,0.7));
  }

  .pj-hero-title {
    font-family: var(--bs-heading-font);
    font-size: 32px;
    font-weight: 700;
    color: #fff;
    margin: 0 0 6px;
    letter-spacing: -0.02em;
    line-height: 1.15;
  }

  .pj-hero-desc {
    font-size: 16px;
    color: rgba(255,255,255,0.85);
    margin: 0;
    line-height: 1.5;
  }

  @media (max-width: 768px) {
    .pj-hero-img { aspect-ratio: 16 / 9; }
    .pj-hero-title { font-size: 24px; }
    .pj-hero-overlay { padding: 24px 16px 16px; }
  }

  /* Overview bar */
  .pj-overview {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 20px 0 24px;
    margin-bottom: 32px;
    border-bottom: 1px solid var(--bs-border);
  }

  .pj-back {
    font-size: 13px;
    color: var(--bs-muted);
    text-decoration: none;
    white-space: nowrap;
    margin-top: 4px;
  }

  .pj-back:hover { color: var(--bs-accent); }

  .pj-overview-stats {
    display: flex;
    gap: 32px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .pj-stat {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
  }

  .pj-stat-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--bs-muted);
    margin-bottom: 2px;
  }

  .pj-stat-value {
    font-size: 14px;
    font-weight: 500;
    color: var(--bs-primary);
  }

  @media (max-width: 768px) {
    .pj-overview { flex-direction: column; gap: 12px; }
    .pj-overview-stats { justify-content: flex-start; gap: 20px; }
    .pj-stat { align-items: flex-start; }
  }

  /* Month sections */
  .pj-month {
    margin-bottom: 48px;
  }

  .pj-month-title {
    font-family: var(--bs-heading-font);
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--bs-muted);
    margin-bottom: 24px;
    padding-bottom: 8px;
    border-bottom: 2px solid var(--bs-accent);
  }

  /* Featured moments — captioned assets */
  .pj-featured {
    display: grid;
    grid-template-columns: 1.2fr 1fr;
    gap: 24px;
    margin-bottom: 32px;
    align-items: start;
  }

  .pj-featured:nth-child(even) {
    direction: rtl;
  }

  .pj-featured:nth-child(even) > * {
    direction: ltr;
  }

  .pj-featured-media {
    border-radius: var(--bs-radius);
    overflow: hidden;
    background: color-mix(in srgb, var(--bs-primary) 3%, var(--bs-bg));
  }

  .pj-featured-media img,
  .pj-featured-media video {
    width: 100%;
    display: block;
    object-fit: cover;
    aspect-ratio: 4 / 3;
  }

  .pj-featured-text {
    padding-top: 8px;
  }

  .pj-featured-caption {
    font-size: 15px;
    line-height: 1.65;
    color: var(--bs-text);
    margin: 0;
  }

  .pj-featured-date {
    display: block;
    font-size: 12px;
    color: var(--bs-muted);
    margin-top: 10px;
  }

  @media (max-width: 768px) {
    .pj-featured {
      grid-template-columns: 1fr;
      gap: 12px;
    }
    .pj-featured:nth-child(even) { direction: ltr; }
  }

  /* Gallery grid — uncaptioned assets */
  .pj-gallery {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    margin-bottom: 24px;
  }

  .pj-gallery-item {
    border-radius: calc(var(--bs-radius) / 2);
    overflow: hidden;
    background: color-mix(in srgb, var(--bs-primary) 3%, var(--bs-bg));
  }

  .pj-gallery-item img,
  .pj-gallery-item video {
    width: 100%;
    aspect-ratio: 1;
    object-fit: cover;
    display: block;
    transition: transform 0.3s;
  }

  .pj-gallery-item:hover img {
    transform: scale(1.05);
  }

  @media (max-width: 640px) {
    .pj-gallery { grid-template-columns: repeat(2, 1fr); }
  }

  /* Entity sections */
  .pj-entities {
    padding-top: 32px;
    border-top: 1px solid var(--bs-border);
    margin-bottom: 32px;
  }

  .pj-entities-title {
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

`;
