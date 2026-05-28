import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { resolveBlogSiteBySlug, getCustomDomain } from "@/lib/blog";
import { normalizePageConfig } from "@/lib/tenant-site/page-config";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ siteSlug: string }>;
}

/**
 * Static pages sitemap — home, about, work, contact, etc.
 * Only includes enabled page slots.
 */
export async function GET(_req: Request, { params }: RouteParams) {
  const { siteSlug } = await params;
  const site = await resolveBlogSiteBySlug(siteSlug);
  if (!site) return new NextResponse("Not Found", { status: 404 });

  const customDomain = await getCustomDomain(site.siteId);
  const origin = customDomain ? `https://${customDomain}` : `https://preview.tracpost.com/${siteSlug}`;

  const [siteRow] = await sql`
    SELECT page_config, business_type FROM businesses WHERE id = ${site.siteId}
  `;

  const pageConfig = normalizePageConfig(
    siteRow?.page_config,
    (siteRow?.business_type as string) || null,
  );

  const pathMap: Record<string, string> = {
    home: "",
    about: "/about",
    work: "/work",
    blog: "/blog",
    projects: "/projects",
    contact: "/contact",
  };

  const urls = pageConfig
    .filter((slot) => slot.enabled && pathMap[slot.key] !== undefined)
    .map((slot) => {
      const path = pathMap[slot.key];
      const priority = slot.key === "home" ? "1.0" : slot.key === "blog" || slot.key === "projects" ? "0.8" : "0.6";
      return `
  <url>
    <loc>${origin}${path}</loc>
    <changefreq>weekly</changefreq>
    <priority>${priority}</priority>
  </url>`;
    })
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="${origin}/sitemap-style.xsl"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}
</urlset>`;

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
