import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { resolveBlogSiteBySlug, getCustomDomain } from "@/lib/blog";
import { sql } from "@/lib/db";
import BlogShell, { type BlogTheme, type NavLink } from "@/components/blog/blog-shell";

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
  const projectsDomain = customDomain ? customDomain.replace("blog.", "projects.") : null;
  const canonicalUrl = projectsDomain
    ? `https://${projectsDomain}/${projectSlug}`
    : `https://tracpost.com/projects/${siteSlug}/${projectSlug}`;

  return {
    title,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: { title, description, url: canonicalUrl, type: "article" },
  };
}

export default async function ProjectPage({ params }: Props) {
  const { siteSlug, projectSlug } = await params;
  const site = await resolveBlogSiteBySlug(siteSlug);
  if (!site) notFound();

  // Fetch project
  const [project] = await sql`
    SELECT id, name, slug, description, address, start_date, end_date, status
    FROM projects
    WHERE site_id = ${site.siteId} AND slug = ${projectSlug}
  `;
  if (!project) notFound();

  const projectId = project.id as string;

  // Parallel data fetches
  const [assets, brands, personas, locationRows, blogSettings, siteRow, logoAsset] = await Promise.all([
    sql`
      SELECT ma.id, ma.storage_url, ma.media_type, ma.context_note, ma.date_taken, ma.created_at, ma.quality_score
      FROM media_assets ma
      JOIN asset_projects ap ON ap.asset_id = ma.id
      WHERE ap.project_id = ${projectId}
        AND ma.triage_status = 'triaged'
      ORDER BY ma.sort_order ASC NULLS LAST
    `,
    sql`
      SELECT DISTINCT b.id, b.name, b.url
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
    sql`SELECT url, location, brand_playbook FROM sites WHERE id = ${site.siteId}`,
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

  const rawTheme = (settings.theme as Record<string, string>) || {};
  const theme: BlogTheme = { ...rawTheme, logoUrl: logoUrl || rawTheme.logoUrl };

  const storedNavLinks = (settings.nav_links as NavLink[]) || [];
  const baseLinks: NavLink[] = storedNavLinks.length > 0
    ? storedNavLinks
    : [
        ...(websiteUrl ? [{ label: "Home", href: websiteUrl }] : []),
      ];
  const hasProjectsLink = baseLinks.some((l) => l.label.toLowerCase() === "projects");
  const navLinks: NavLink[] = hasProjectsLink
    ? baseLinks
    : [...baseLinks, { label: "Projects", href: `/projects/${siteSlug}` }];

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
  const captionedCount = assets.filter((a: Record<string, unknown>) => a.context_note).length;

  // Hero image — highest quality asset
  const heroAsset = assets[0];
  const heroUrl = heroAsset?.storage_url ? String(heroAsset.storage_url) : null;

  // Group assets by month for timeline
  const timeline = new Map<string, Array<Record<string, unknown>>>();
  for (const asset of assets) {
    const date = asset.date_taken || asset.created_at;
    const month = date
      ? new Date(date as string).toLocaleDateString("en-US", { year: "numeric", month: "long" })
      : "Undated";
    if (!timeline.has(month)) timeline.set(month, []);
    timeline.get(month)!.push(asset);
  }

  return (
    <BlogShell
      siteName={site.siteName}
      tagline={tagline}
      navLinks={navLinks}
      theme={theme}
      location={siteLocation}
      websiteUrl={websiteUrl}
    >
      {/* Hero */}
      {heroUrl && (
        <img src={heroUrl} alt={String(project.name)} className="bs-hero-media" />
      )}

      <header className="bs-project-header">
        <Link href={`/projects/${siteSlug}`} className="bs-back-link">
          &larr; All Projects
        </Link>
        <h1 className="bs-article-page-title">{String(project.name)}</h1>
        {project.description && (
          <p className="bs-project-description">{String(project.description)}</p>
        )}
        <div className="bs-article-meta">
          {startDate && (
            <span>{startDate}{endDate && endDate !== startDate ? ` — ${endDate}` : ""}</span>
          )}
          {(location?.city || location?.state) && (
            <span>· {[location.city, location.state].filter(Boolean).join(", ")}</span>
          )}
          <span>· {assets.length} photos</span>
        </div>
      </header>

      {/* Timeline */}
      {Array.from(timeline.entries()).map(([month, monthAssets]) => (
        <section key={month} className="bs-timeline-section">
          <h2 className="bs-timeline-month">{month}</h2>
          <div className="bs-timeline-grid">
            {monthAssets.map((asset) => {
              const isVideo = (asset.media_type as string) === "video";
              const caption = asset.context_note ? String(asset.context_note) : null;
              const dateTaken = asset.date_taken
                ? new Date(asset.date_taken as string).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                : null;

              return (
                <div key={String(asset.id)} className={caption ? "bs-timeline-item bs-timeline-captioned" : "bs-timeline-item"}>
                  {isVideo ? (
                    <video
                      src={String(asset.storage_url)}
                      controls
                      className="bs-timeline-media"
                      preload="metadata"
                    />
                  ) : (
                    <img
                      src={String(asset.storage_url)}
                      alt={caption || ""}
                      className="bs-timeline-media"
                      loading="lazy"
                    />
                  )}
                  {caption && (
                    <div className="bs-timeline-caption">
                      <p>{caption}</p>
                      {dateTaken && <span className="bs-timeline-date">{dateTaken}</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {/* Brands */}
      {brands.length > 0 && (
        <section className="bs-entity-section">
          <h2 className="bs-aside-title">Materials &amp; Equipment</h2>
          <div className="bs-entity-chips">
            {brands.map((b: Record<string, unknown>) => (
              <span key={String(b.id)} className="bs-entity-chip">
                {b.url ? (
                  <a href={String(b.url)} target="_blank" rel="noopener noreferrer">{String(b.name)}</a>
                ) : String(b.name)}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Personas */}
      {personas.filter((p: Record<string, unknown>) => p.consent_given).length > 0 && (
        <section className="bs-entity-section">
          <h2 className="bs-aside-title">Team</h2>
          <div className="bs-entity-chips">
            {personas
              .filter((p: Record<string, unknown>) => p.consent_given)
              .map((p: Record<string, unknown>) => (
                <span key={String(p.id)} className="bs-entity-chip">
                  {String(p.name)}
                  <span className="bs-entity-type">{String(p.type)}</span>
                </span>
              ))}
          </div>
        </section>
      )}

      <style dangerouslySetInnerHTML={{ __html: projectPageStyles }} />
    </BlogShell>
  );
}

const projectPageStyles = `
  .bs-hero-media {
    width: 100%;
    aspect-ratio: 16 / 9;
    object-fit: cover;
    border-radius: var(--bs-radius);
    margin-bottom: 32px;
  }

  .bs-back-link {
    display: inline-block;
    font-size: 14px;
    color: var(--bs-muted);
    text-decoration: none;
    margin-bottom: 16px;
  }

  .bs-back-link:hover {
    color: var(--bs-accent);
  }

  .bs-project-header {
    margin-bottom: 48px;
    padding-bottom: 24px;
    border-bottom: 1px solid var(--bs-border);
  }

  .bs-project-description {
    font-size: 18px;
    line-height: 1.6;
    color: var(--bs-muted);
    margin: 12px 0 16px;
  }

  /* Timeline */
  .bs-timeline-section {
    margin-bottom: 48px;
  }

  .bs-timeline-month {
    font-family: var(--bs-heading-font);
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--bs-muted);
    margin-bottom: 20px;
    padding-bottom: 8px;
    border-bottom: 2px solid var(--bs-accent);
  }

  .bs-timeline-grid {
    display: grid;
    gap: 24px;
  }

  .bs-timeline-item {
    border-radius: var(--bs-radius);
    overflow: hidden;
  }

  .bs-timeline-captioned {
    border: 1px solid var(--bs-border);
  }

  .bs-timeline-media {
    width: 100%;
    max-height: 70vh;
    object-fit: contain;
    display: block;
    background: color-mix(in srgb, var(--bs-primary) 3%, var(--bs-bg));
  }

  .bs-timeline-caption {
    padding: 16px 20px;
  }

  .bs-timeline-caption p {
    font-size: 15px;
    line-height: 1.65;
    color: var(--bs-text);
    margin: 0;
  }

  .bs-timeline-date {
    display: block;
    font-size: 12px;
    color: var(--bs-muted);
    margin-top: 8px;
  }

  /* Entity sections */
  .bs-entity-section {
    padding-top: 32px;
    border-top: 1px solid var(--bs-border);
    margin-bottom: 32px;
  }

  .bs-entity-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .bs-entity-chip {
    font-size: 14px;
    padding: 6px 14px;
    border-radius: var(--bs-radius);
    border: 1px solid var(--bs-border);
    color: var(--bs-text);
  }

  .bs-entity-chip a {
    color: var(--bs-accent);
    text-decoration: none;
  }

  .bs-entity-chip a:hover {
    text-decoration: underline;
  }

  .bs-entity-type {
    font-size: 11px;
    color: var(--bs-muted);
    margin-left: 6px;
  }
`;
