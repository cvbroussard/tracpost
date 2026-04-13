import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { resolveBlogSiteBySlug, getCustomDomain, getBlogPosts, getFavicon } from "@/lib/blog";
import { sql } from "@/lib/db";
import BlogShell, { type BlogTheme, type NavLink } from "@/components/blog/blog-shell";
import { ProjectHubAside } from "@/components/blog/project-aside";
import { projectUrl, publicProjectsUrl } from "@/lib/urls";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ siteSlug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { siteSlug } = await params;
  const site = await resolveBlogSiteBySlug(siteSlug);
  if (!site) return {};

  const title = `Projects — ${site.siteName}`;
  const description = `View our completed projects and ongoing work at ${site.siteName}`;
  const customDomain = await getCustomDomain(site.siteId);
  const favicon = await getFavicon(site.siteId);
  const canonicalUrl = publicProjectsUrl(siteSlug, customDomain);

  return {
    title,
    description,
    ...(favicon ? { icons: { icon: favicon } } : {}),
    alternates: { canonical: canonicalUrl },
    openGraph: { title, description, url: canonicalUrl, type: "website" },
  };
}

export default async function ProjectsIndexPage({ params }: Props) {
  const { siteSlug } = await params;
  const site = await resolveBlogSiteBySlug(siteSlug);
  if (!site) notFound();

  // Fetch shell data + projects
  const [blogSettings, siteRow, logoAsset, projects, recentPosts] = await Promise.all([
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
      SELECT p.id, p.name, p.slug, p.description, p.status, p.start_date, p.end_date,
             (SELECT COUNT(*)::int FROM asset_projects ap WHERE ap.project_id = p.id) AS asset_count,
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
    getBlogPosts(site.siteId, 5),
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
    : [
        ...(websiteUrl ? [{ label: "Home", href: websiteUrl }] : []),
      ];

  const playbook = siteInfo.brand_playbook as Record<string, unknown> | null;
  const angles = (playbook?.brandPositioning as Record<string, unknown>)?.selectedAngles;
  const tagline = Array.isArray(angles) && angles[0]
    ? String((angles[0] as Record<string, unknown>).tagline || "")
    : "";
  const aboutText = site.blogDescription || tagline || "";

  // Custom domain base URLs
  const customDomainVal = await getCustomDomain(site.siteId);
  const projectsBaseUrl = customDomainVal
    ? `https://${customDomainVal.replace("blog.", "projects.")}`
    : null;
  const blogBaseUrl = customDomainVal
    ? `https://${customDomainVal}`
    : null;

  // Aside data
  const projectNavItems = projects.map((p: Record<string, unknown>) => ({
    slug: String(p.slug),
    name: String(p.name),
    coverImage: p.cover_image ? String(p.cover_image) : null,
    assetCount: Number(p.asset_count) || 0,
  }));

  const blogNavItems = recentPosts.map((p: Record<string, unknown>) => ({
    slug: String(p.slug),
    title: String(p.title),
    published_at: String(p.published_at),
  }));

  return (
    <BlogShell
      siteName={site.siteName}
      siteSlug={siteSlug}
      customDomain={customDomainVal}
      tagline={tagline}
      navLinks={navLinks}
      theme={theme}
      location={siteLocation}
      phone={businessPhone}
      websiteUrl={websiteUrl}
      aside={
        <ProjectHubAside
          siteSlug={siteSlug}
          projects={projectNavItems}
          recentPosts={blogNavItems}
          aboutText={aboutText}
          projectsBaseUrl={projectsBaseUrl}
          blogBaseUrl={blogBaseUrl}
        />
      }
    >
      <h1 className="bs-article-page-title" style={{ marginBottom: 32 }}>Our Work</h1>

      {projects.length === 0 ? (
        <p style={{ padding: "48px 0", textAlign: "center", color: "var(--bs-muted)" }}>
          No projects published yet.
        </p>
      ) : (
        <div className="bs-project-grid">
          {projects.map((project) => {
            const coverImage = project.cover_image ? String(project.cover_image) : null;
            const startDate = project.start_date
              ? new Date(String(project.start_date)).toLocaleDateString("en-US", { year: "numeric", month: "short" })
              : null;
            const projectHref = projectUrl(siteSlug, String(project.slug), customDomainVal);

            return (
              <a
                key={String(project.id)}
                href={projectHref}
                className="bs-project-card"
              >
                {coverImage ? (
                  <img src={coverImage} alt={String(project.name)} className="bs-project-cover" />
                ) : (
                  <div className="bs-project-cover-empty" />
                )}
                <div className="bs-project-info">
                  <h2 className="bs-project-name">{String(project.name)}</h2>
                  {project.description && (
                    <p className="bs-project-desc">{String(project.description)}</p>
                  )}
                  <div className="bs-project-meta">
                    {startDate && <span>{startDate}</span>}
                    <span>{project.asset_count} photos</span>
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: projectStyles }} />
    </BlogShell>
  );
}

const projectStyles = `
  .bs-project-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 24px;
  }

  @media (max-width: 640px) {
    .bs-project-grid {
      grid-template-columns: 1fr;
    }
  }

  .bs-project-card {
    display: block;
    text-decoration: none;
    color: inherit;
    border-radius: var(--bs-radius);
    overflow: hidden;
    border: 1px solid var(--bs-border);
    transition: box-shadow 0.2s, transform 0.2s;
  }

  .bs-project-card:hover {
    box-shadow: 0 4px 20px rgba(0,0,0,0.08);
    transform: translateY(-2px);
  }

  .bs-project-cover {
    width: 100%;
    aspect-ratio: 3 / 2;
    object-fit: cover;
  }

  .bs-project-cover-empty {
    width: 100%;
    aspect-ratio: 3 / 2;
    background: var(--bs-border);
  }

  .bs-project-info {
    padding: 16px;
  }

  .bs-project-name {
    font-family: var(--bs-heading-font);
    font-size: 17px;
    font-weight: 600;
    color: var(--bs-primary);
    margin: 0 0 6px;
    line-height: 1.3;
  }

  .bs-project-desc {
    font-size: 14px;
    color: var(--bs-muted);
    margin: 0 0 8px;
    line-height: 1.5;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .bs-project-meta {
    display: flex;
    gap: 12px;
    font-size: 12px;
    color: var(--bs-muted);
  }
`;
