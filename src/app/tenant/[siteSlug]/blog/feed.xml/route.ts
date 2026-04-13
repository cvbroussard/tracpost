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

  const posts = await getBlogPosts(site.siteId, 50);
  const customDomain = await getCustomDomain(site.siteId);
  const baseUrl = publicBlogUrl(siteSlug, customDomain);
  const feedUrl = `${baseUrl}/feed.xml`;
  const title = site.blogTitle || site.siteName;

  const items = posts.map((post) => {
    const pillar = post.content_pillar ? `\n      <category>${post.content_pillar}</category>` : "";
    const tags = Array.isArray(post.tags)
      ? (post.tags as string[]).map((t) => `\n      <category>${t}</category>`).join("")
      : "";
    const enclosure = post.og_image_url
      ? `\n      <enclosure url="${post.og_image_url}" type="image/jpeg" />`
      : "";

    const articleUrl = publicBlogArticleUrl(siteSlug, String(post.slug), customDomain);
    return `
    <item>
      <title><![CDATA[${post.title}]]></title>
      <link>${articleUrl}</link>
      <description><![CDATA[${post.excerpt || ""}]]></description>
      <pubDate>${new Date(post.published_at as string).toUTCString()}</pubDate>
      <guid>${articleUrl}</guid>${pillar}${tags}${enclosure}
    </item>`;
  }).join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${title}</title>
    <link>${baseUrl}</link>
    <description>${site.blogDescription || ""}</description>
    <atom:link href="${feedUrl}" rel="self" type="application/rss+xml"/>
    <language>en-us</language>${items}
  </channel>
</rss>`;

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/rss+xml",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
