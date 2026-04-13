import { NextResponse } from "next/server";
import { resolveBlogSiteBySlug, getBlogPosts, getCustomDomain } from "@/lib/blog";
import { publicBlogUrl, publicBlogArticleUrl } from "@/lib/urls";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ siteSlug: string }>;
}

export async function GET(_req: Request, { params }: RouteParams) {
  const { siteSlug } = await params;
  const site = await resolveBlogSiteBySlug(siteSlug);

  if (!site) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const posts = await getBlogPosts(site.siteId, 500);
  const customDomain = await getCustomDomain(site.siteId);
  const baseUrl = publicBlogUrl(siteSlug, customDomain);

  const postUrls = posts.map((post) => `
    <url>
      <loc>${publicBlogArticleUrl(siteSlug, String(post.slug), customDomain)}</loc>
      <lastmod>${new Date(post.published_at as string).toISOString()}</lastmod>
      <changefreq>monthly</changefreq>
      <priority>0.6</priority>
    </url>`).join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <url>
      <loc>${baseUrl}</loc>
      <changefreq>weekly</changefreq>
      <priority>0.9</priority>
    </url>${postUrls}
</urlset>`;

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
