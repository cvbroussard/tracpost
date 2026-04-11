import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { resolveBlogSiteBySlug, resolveBlogSite, getBlogPost, getBlogPosts, getCustomDomain } from "@/lib/blog";
import { sql } from "@/lib/db";
import { generateArticleSchema } from "@/lib/blog/schema";
import { autoLinkEntities } from "@/lib/blog/auto-linker";
import { markdownToHtml } from "@/lib/blog/markdown";
import BlogShell, { type BlogTheme, type NavLink } from "@/components/blog/blog-shell";
import BlogAside from "@/components/blog/blog-aside";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ siteSlug: string; articleSlug: string }>;
}

/**
 * Resolve the site — try by slug first (multi-tenant hub),
 * fall back to hostname resolution (custom domain / subdomain).
 */
async function resolveSite(siteSlug: string) {
  const bySlug = await resolveBlogSiteBySlug(siteSlug);
  if (bySlug) return bySlug;

  // Fallback: if accessed via custom domain, resolve by hostname
  const headersList = await headers();
  const blogHost = headersList.get("x-blog-host") || "blog.tracpost.com";
  return resolveBlogSite(blogHost);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { siteSlug, articleSlug } = await params;
  const site = await resolveSite(siteSlug);
  if (!site) return {};

  const p = await getBlogPost(site.siteId, articleSlug);
  if (!p) return {};

  const row = p as Record<string, unknown>;
  const articleTitle = String(row.title || "");
  const metaDesc = String(row.meta_description || row.excerpt || "");
  const publishedIso = row.published_at ? new Date(String(row.published_at)).toISOString() : undefined;
  const updatedIso = row.updated_at ? new Date(String(row.updated_at)).toISOString() : undefined;

  // Canonical: custom domain if configured, otherwise tracpost.com
  const customDomain = await getCustomDomain(site.siteId);
  const canonicalUrl = customDomain
    ? `https://${customDomain}/${articleSlug}`
    : `https://tracpost.com/blog/${siteSlug}/${articleSlug}`;

  return {
    title: articleTitle,
    description: metaDesc,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title: articleTitle,
      description: metaDesc,
      url: canonicalUrl,
      images: row.og_image_url ? [String(row.og_image_url)] : undefined,
      type: "article",
      publishedTime: publishedIso,
      modifiedTime: updatedIso,
      section: row.content_pillar ? String(row.content_pillar) : undefined,
      tags: Array.isArray(row.tags) ? (row.tags as string[]) : undefined,
    },
  };
}

export default async function ArticlePage({ params }: Props) {
  const { siteSlug, articleSlug } = await params;
  const site = await resolveSite(siteSlug);
  if (!site) notFound();

  const postRow = await getBlogPost(site.siteId, articleSlug);
  if (!postRow) notFound();

  const post = postRow as Record<string, unknown>;
  const title = String(post.title || "");
  const body = String(post.body || "");
  const excerpt = String(post.excerpt || "");
  const ogImage = post.og_image_url ? String(post.og_image_url) : null;
  const publishedAt = post.published_at ? String(post.published_at) : null;
  const pillar = post.content_pillar ? String(post.content_pillar) : null;
  const tags = Array.isArray(post.tags) ? (post.tags as string[]) : [];
  const metadata = (post.metadata || {}) as Record<string, unknown>;
  const videoUrl = metadata.video_url ? String(metadata.video_url) : null;

  // Fetch shell data
  const [blogSettings, siteRow, logoAsset, allPosts] = await Promise.all([
    sql`SELECT nav_links, theme FROM blog_settings WHERE site_id = ${site.siteId}`,
    sql`SELECT url, location, brand_playbook FROM sites WHERE id = ${site.siteId}`,
    sql`
      SELECT storage_url FROM media_assets
      WHERE site_id = ${site.siteId}
        AND media_type LIKE 'image%'
        AND metadata->>'is_logo' = 'true'
      LIMIT 1
    `,
    getBlogPosts(site.siteId, 5),
  ]);

  const settings = blogSettings[0] || {};
  const siteInfo = siteRow[0] || {};
  const websiteUrl = (siteInfo.url as string) || null;
  const logoUrl = (logoAsset[0]?.storage_url as string) || null;

  // Theme
  const rawTheme = (settings.theme as Record<string, string>) || {};
  const theme: BlogTheme = {
    ...rawTheme,
    logoUrl: logoUrl || rawTheme.logoUrl,
  };

  // Nav links
  const storedNavLinks = (settings.nav_links as NavLink[]) || [];
  const navLinks: NavLink[] = storedNavLinks.length > 0
    ? storedNavLinks
    : [
        ...(websiteUrl ? [{ label: "Home", href: websiteUrl }] : []),
        { label: "Blog", href: `/blog/${siteSlug}` },
      ];

  // Aside data
  const playbook = siteInfo.brand_playbook as Record<string, unknown> | null;
  const angles = (playbook?.brandPositioning as Record<string, unknown>)?.selectedAngles;
  const tagline = Array.isArray(angles) && angles[0]
    ? String((angles[0] as Record<string, unknown>).tagline || "")
    : "";
  const aboutText = site.blogDescription || tagline || "";
  const pillars = [...new Set(allPosts.map((p) => p.content_pillar as string).filter(Boolean))];
  const recentPosts = allPosts
    .filter((p) => String(p.slug) !== articleSlug)
    .slice(0, 5)
    .map((p) => ({
      slug: String(p.slug),
      title: String(p.title),
      published_at: String(p.published_at),
    }));

  const schema = generateArticleSchema({
    title,
    excerpt,
    ogImageUrl: ogImage,
    publishedAt,
    updatedAt: post.updated_at ? String(post.updated_at) : null,
    tags,
    siteSlug,
    articleSlug,
    siteName: site.siteName,
  });

  const siteLocation = (siteInfo.location as string) || null;

  return (
    <BlogShell
      siteName={site.siteName}
      description={aboutText}
      tagline={tagline}
      navLinks={navLinks}
      theme={theme}
      location={siteLocation}
      websiteUrl={websiteUrl}
      aside={
        <BlogAside
          siteSlug={siteSlug}
          recentPosts={recentPosts}
          pillars={pillars}
          aboutText={aboutText}
        />
      }
    >
      {/* JSON-LD schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />

      <article className="bs-article">
        {/* Hero image — full width above article content */}
        {videoUrl ? (
          <video
            src={videoUrl}
            poster={ogImage || undefined}
            autoPlay
            muted
            loop
            playsInline
            className="bs-hero-media"
          />
        ) : ogImage ? (
          <img src={ogImage} alt={title} className="bs-hero-media" />
        ) : null}

        <header className="bs-article-header">
          {pillar && (
            <span className="bs-article-pillar-tag">{pillar}</span>
          )}
          <h1 className="bs-article-page-title">{title}</h1>
          <div className="bs-article-meta">
            <span>{site.siteName}</span>
            {publishedAt && (
              <>
                <span>·</span>
                <time>
                  {new Date(publishedAt).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </time>
              </>
            )}
          </div>
        </header>

        {/* Blog body */}
        <div
          className="bs-prose"
          dangerouslySetInnerHTML={{
            __html: await autoLinkEntities(
              markdownToHtml(body),
              site.siteId,
              siteSlug,
              articleSlug
            ),
          }}
        />

        {/* Tags */}
        {tags.length > 0 && (
          <div className="bs-tags">
            {tags.map((tag) => (
              <Link key={tag} href={`/blog/${siteSlug}?tag=${encodeURIComponent(tag)}`} className="bs-tag">
                {tag}
              </Link>
            ))}
          </div>
        )}
      </article>

      {/* Prose styles */}
      <style dangerouslySetInnerHTML={{ __html: proseStyles }} />
    </BlogShell>
  );
}

const proseStyles = `
  /* Article page layout */
  .bs-hero-media {
    width: 100%;
    aspect-ratio: 16 / 9;
    object-fit: cover;
    border-radius: var(--bs-radius);
    margin-bottom: 32px;
  }

  .bs-article-header {
    margin-bottom: 36px;
    padding-bottom: 24px;
    border-bottom: 1px solid var(--bs-border);
  }

  .bs-article-pillar-tag {
    display: inline-block;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--bs-accent);
    margin-bottom: 12px;
  }

  .bs-article-page-title {
    font-family: var(--bs-heading-font);
    font-size: 36px;
    font-weight: 700;
    line-height: 1.15;
    letter-spacing: -0.02em;
    color: var(--bs-primary);
    margin: 0 0 16px;
  }

  @media (max-width: 768px) {
    .bs-article-page-title {
      font-size: 28px;
    }
  }

  /* Prose body */
  .bs-prose {
    font-size: 17px;
    line-height: 1.7;
    color: var(--bs-text);
  }

  .bs-prose p {
    margin-bottom: 1.25em;
  }

  .bs-prose a {
    color: var(--bs-accent);
    text-decoration: none;
  }

  .bs-prose a:hover {
    text-decoration: underline;
  }

  .bs-prose strong {
    font-weight: 600;
    color: var(--bs-primary);
  }

  .bs-prose h2 {
    font-family: var(--bs-heading-font);
    font-size: 24px;
    font-weight: 600;
    line-height: 1.3;
    color: var(--bs-primary);
    margin-top: 2em;
    margin-bottom: 0.5em;
  }

  .bs-prose h3 {
    font-family: var(--bs-heading-font);
    font-size: 20px;
    font-weight: 600;
    line-height: 1.4;
    color: var(--bs-primary);
    margin-top: 1.5em;
    margin-bottom: 0.5em;
  }

  .bs-prose ul, .bs-prose ol {
    margin-bottom: 1.25em;
    padding-left: 1.5em;
  }

  .bs-prose li {
    margin-bottom: 0.4em;
  }

  .bs-prose img {
    width: 100%;
    border-radius: var(--bs-radius);
    margin: 1.5em 0;
  }

  .bs-prose blockquote {
    border-left: 3px solid var(--bs-border);
    padding-left: 1em;
    margin: 1.5em 0;
    color: var(--bs-muted);
    font-style: italic;
  }

  .bs-prose code {
    background: #f3f4f6;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 0.9em;
  }

  .bs-prose pre {
    background: #f3f4f6;
    padding: 16px;
    border-radius: var(--bs-radius);
    overflow-x: auto;
    margin: 1.5em 0;
  }

  .bs-prose pre code {
    background: none;
    padding: 0;
  }

  /* Tags */
  .bs-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 48px;
    padding-top: 24px;
    border-top: 1px solid var(--bs-border);
  }

  .bs-tag {
    font-size: 13px;
    padding: 5px 14px;
    border-radius: var(--bs-radius);
    border: 1px solid var(--bs-border);
    color: var(--bs-muted);
    text-decoration: none;
    transition: all 0.15s;
  }

  .bs-tag:hover {
    border-color: var(--bs-accent);
    color: var(--bs-accent);
  }
`;
