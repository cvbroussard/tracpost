/**
 * Website Spinner — orchestrates content generation, rendering, and deployment.
 *
 * One function call: generates a complete static website from the tenant's
 * brand playbook, assets, and entities, then deploys to Vercel.
 */
import { sql } from "@/lib/db";
import { generateWebsiteCopy } from "./copy-generator";
import { selectAssets } from "./asset-picker";
import { renderWebsite } from "./renderer";
import { deployWebsite } from "./deploy";
import type { SiteTheme } from "./templates/layout";
import { publicBlogUrl, publicProjectsUrl, publicBrandHubUrl } from "@/lib/urls";

interface SpinResult {
  success: boolean;
  url?: string;
  projectId?: string;
  pages?: number;
  error?: string;
}

export async function spinWebsite(siteId: string): Promise<SpinResult> {
  // 1. Gather all data
  const [siteRow, blogSettings, projects, articles, brands, personas] = await Promise.all([
    sql`
      SELECT name, url, location, business_type, brand_playbook, blog_slug,
             business_phone, business_email, business_logo, business_favicon
      FROM sites WHERE id = ${siteId}
    `,
    sql`SELECT theme, custom_domain, subdomain FROM blog_settings WHERE site_id = ${siteId}`,
    sql`
      SELECT p.name, p.slug, p.description,
             (SELECT COUNT(*)::int FROM asset_projects ap WHERE ap.project_id = p.id) AS asset_count,
             (SELECT ma.storage_url FROM asset_projects ap2
              JOIN media_assets ma ON ma.id = ap2.asset_id
              WHERE ap2.project_id = p.id AND ma.media_type LIKE 'image%'
              ORDER BY ma.quality_score DESC NULLS LAST LIMIT 1
             ) AS cover_image
      FROM projects p
      WHERE p.site_id = ${siteId}
        AND (SELECT COUNT(*) FROM asset_projects ap WHERE ap.project_id = p.id) >= 3
      ORDER BY p.start_date DESC NULLS LAST
    `,
    sql`
      SELECT title, slug, excerpt, og_image_url, published_at
      FROM blog_posts
      WHERE site_id = ${siteId} AND status = 'published'
      ORDER BY published_at DESC
      LIMIT 3
    `,
    sql`
      SELECT name, slug FROM brands
      WHERE site_id = ${siteId}
        AND (SELECT COUNT(*) FROM asset_brands ab WHERE ab.brand_id = brands.id) >= 2
      ORDER BY name
    `,
    sql`
      SELECT name, type FROM personas
      WHERE site_id = ${siteId} AND consent_given = true
    `,
  ]);

  const site = siteRow[0];
  if (!site) return { success: false, error: "Site not found" };

  const settings = blogSettings[0] || {};
  const playbook = site.brand_playbook as Record<string, unknown> | null;
  if (!playbook) return { success: false, error: "No brand playbook — generate one first" };

  // Extract playbook data
  const positioning = playbook.brandPositioning as Record<string, unknown>;
  const angles = (positioning?.selectedAngles as Array<Record<string, unknown>>) || [];
  const angle = angles[0] || {};
  const audience = playbook.audienceResearch as Record<string, unknown>;
  const langMap = (audience?.languageMap as Record<string, string[]>) || {};
  const painPoints = ((audience?.painPoints as Array<Record<string, unknown>>) || [])
    .map((p) => String(p.pain));
  const offerCore = playbook.offerCore as Record<string, unknown>;
  const offerStatement = (offerCore?.offerStatement as Record<string, unknown>) || {};

  const siteName = String(site.name);
  const location = String(site.location || "");
  const businessType = String(site.business_type || "business");
  const tagline = String(angle.tagline || "");
  const siteSlug = String(settings.subdomain || site.blog_slug || "");
  const customDomain = (settings.custom_domain as string) || null;

  // URLs for cross-linking
  const blogUrl = publicBlogUrl(siteSlug, customDomain);
  const projectsUrl = publicProjectsUrl(siteSlug, customDomain);
  const brandsUrl = publicBrandHubUrl(siteSlug, customDomain);

  // Theme
  const rawTheme = (settings.theme as Record<string, string>) || {};
  const theme: SiteTheme = {
    primaryColor: rawTheme.primaryColor || "#1a1a1a",
    accentColor: rawTheme.accentColor || "#3b82f6",
    backgroundColor: rawTheme.backgroundColor || "#ffffff",
    textColor: rawTheme.textColor || "#1a1a1a",
    mutedColor: rawTheme.mutedColor || "#6b7280",
    borderColor: rawTheme.borderColor || "#e5e7eb",
    fontFamily: rawTheme.fontFamily || "system-ui, sans-serif",
    headingFontFamily: rawTheme.headingFontFamily || "system-ui, sans-serif",
    borderRadius: rawTheme.borderRadius || "6px",
  };

  // 2. Generate copy
  console.log(`[Spinner] Generating copy for ${siteName}...`);
  const copy = await generateWebsiteCopy({
    siteName,
    businessType,
    location,
    tagline,
    offer: String(offerStatement.finalStatement || ""),
    tone: String(angle.tone || ""),
    contentThemes: (angle.contentThemes as string[]) || [],
    painPoints,
    desirePhrases: langMap.desirePhrases || [],
  });

  // 3. Select assets
  console.log(`[Spinner] Selecting assets...`);
  const assets = await selectAssets(siteId);

  // 4. Render HTML
  console.log(`[Spinner] Rendering pages...`);
  const pages = await renderWebsite({
    siteId,
    siteName,
    tagline,
    location,
    phone: (site.business_phone as string) || undefined,
    email: (site.business_email as string) || undefined,
    logoUrl: (site.business_logo as string) || undefined,
    faviconUrl: (site.business_favicon as string) || undefined,
    theme,
    blogUrl,
    projectsUrl,
    brandsUrl,
    copy,
    assets,
    projects: projects.map((p: Record<string, unknown>) => ({
      name: String(p.name),
      description: p.description ? String(p.description) : undefined,
      coverImage: p.cover_image ? String(p.cover_image) : undefined,
      assetCount: Number(p.asset_count) || 0,
      slug: String(p.slug),
    })),
    articles: articles.map((a: Record<string, unknown>) => ({
      title: String(a.title),
      excerpt: a.excerpt ? String(a.excerpt) : undefined,
      image: a.og_image_url ? String(a.og_image_url) : undefined,
      slug: String(a.slug),
      date: a.published_at
        ? new Date(String(a.published_at)).toLocaleDateString("en-US", {
            year: "numeric", month: "long", day: "numeric",
          })
        : "",
    })),
    brands: brands.map((b: Record<string, unknown>) => ({
      name: String(b.name),
      slug: String(b.slug),
    })),
    personas: personas.map((p: Record<string, unknown>) => ({
      name: String(p.name),
      type: String(p.type),
    })),
  });

  // 5. Deploy to Vercel
  const projectName = `${siteSlug}-site`;
  const tenantDomain = site.url ? new URL(String(site.url)).hostname : undefined;

  console.log(`[Spinner] Deploying ${pages.length} pages to ${projectName}...`);
  const result = await deployWebsite(
    projectName,
    pages.map((p) => ({ file: p.file, html: p.html })),
    tenantDomain,
  );

  if (result.success) {
    console.log(`[Spinner] Deployed: ${result.url}`);
  } else {
    console.error(`[Spinner] Deploy failed: ${result.error}`);
  }

  return {
    ...result,
    pages: pages.length,
  };
}
