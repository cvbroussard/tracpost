import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { resolveBlogSiteBySlug, getCustomDomain } from "@/lib/blog";
import { publicProjectsUrl, publicProjectUrl } from "@/lib/urls";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ siteSlug: string }>;
}

/**
 * Projects sitemap — project hub + individual project pages.
 */
export async function GET(_req: Request, { params }: RouteParams) {
  const { siteSlug } = await params;
  const site = await resolveBlogSiteBySlug(siteSlug);
  if (!site) return new NextResponse("Not Found", { status: 404 });

  const customDomain = await getCustomDomain(site.siteId);

  const projects = await sql`
    SELECT slug, created_at FROM projects
    WHERE site_id = ${site.siteId}
    ORDER BY created_at DESC
    LIMIT 500
  `;

  const hubUrl = publicProjectsUrl(siteSlug, customDomain);

  const projectUrls = projects.map((p) => `
  <url>
    <loc>${publicProjectUrl(siteSlug, p.slug as string, customDomain)}</loc>
    <lastmod>${p.created_at ? new Date(p.created_at as string).toISOString() : new Date().toISOString()}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>`).join("");

  const origin = customDomain ? `https://${customDomain}` : `https://preview.tracpost.com/${siteSlug}`;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="${origin}/sitemap-style.xsl"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${hubUrl}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>${projectUrls}
</urlset>`;

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
