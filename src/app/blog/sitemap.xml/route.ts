import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { resolveBlogSite, getBlogPosts } from "@/lib/blog";

export const dynamic = "force-dynamic";

export async function GET() {
  const headersList = await headers();
  const blogHost = headersList.get("x-blog-host") || "blog.tracpost.com";
  const site = await resolveBlogSite(blogHost);

  if (!site) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const posts = await getBlogPosts(site.siteId, 100);
  const baseUrl = `https://${blogHost}`;

  const urls = posts.map((post) => `
    <url>
      <loc>${baseUrl}/${post.slug}</loc>
      <lastmod>${new Date(post.published_at as string).toISOString()}</lastmod>
      <changefreq>monthly</changefreq>
    </url>`).join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <url>
      <loc>${baseUrl}/</loc>
      <changefreq>weekly</changefreq>
      <priority>1.0</priority>
    </url>${urls}
</urlset>`;

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
