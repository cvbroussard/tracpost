import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { resolveBlogSiteBySlug, getBlogPosts, getCustomDomain } from "@/lib/blog";
import { sql } from "@/lib/db";
import { generateHubSchema } from "@/lib/blog/schema";
import BlogShell, { type BlogTheme, type NavLink } from "@/components/blog/blog-shell";
import BlogAside from "@/components/blog/blog-aside";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ siteSlug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { siteSlug } = await params;
  const site = await resolveBlogSiteBySlug(siteSlug);
  if (!site) return {};

  const title = site.blogTitle || site.siteName;
  const description = site.blogDescription || `${site.siteName} — articles and updates`;

  const customDomain = await getCustomDomain(site.siteId);
  const hubUrl = customDomain
    ? `https://${customDomain}`
    : `https://tracpost.com/blog/${siteSlug}`;

  return {
    title,
    description,
    alternates: {
      canonical: hubUrl,
      types: { "application/rss+xml": `/blog/${siteSlug}/feed.xml` },
    },
    openGraph: {
      title,
      description,
      url: hubUrl,
      type: "website",
    },
  };
}

export default async function HubPage({ params }: Props) {
  const { siteSlug } = await params;
  const site = await resolveBlogSiteBySlug(siteSlug);
  if (!site) notFound();

  // Parallel data fetches
  const [posts, blogSettings, siteRow, logoAsset] = await Promise.all([
    getBlogPosts(site.siteId, 20),
    sql`SELECT nav_links, theme FROM blog_settings WHERE site_id = ${site.siteId}`,
    sql`SELECT url, brand_playbook FROM sites WHERE id = ${site.siteId}`,
    sql`
      SELECT storage_url FROM media_assets
      WHERE site_id = ${site.siteId}
        AND media_type LIKE 'image%'
        AND metadata->>'is_logo' = 'true'
      LIMIT 1
    `,
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

  // Nav links — from blog_settings or generate defaults
  const storedNavLinks = (settings.nav_links as NavLink[]) || [];
  const navLinks: NavLink[] = storedNavLinks.length > 0
    ? storedNavLinks
    : [
        ...(websiteUrl ? [{ label: "Home", href: websiteUrl }] : []),
        { label: "Blog", href: `/blog/${siteSlug}` },
      ];

  // Playbook tagline for about text
  const playbook = siteInfo.brand_playbook as Record<string, unknown> | null;
  const angles = (playbook?.brandPositioning as Record<string, unknown>)?.selectedAngles;
  const tagline = Array.isArray(angles) && angles[0]
    ? String((angles[0] as Record<string, unknown>).tagline || "")
    : "";
  const aboutText = site.blogDescription || tagline || "";

  // Pillars from posts
  const pillars = [...new Set(posts.map((p) => p.content_pillar as string).filter(Boolean))];

  // Generate schema
  const schema = await generateHubSchema({
    siteId: site.siteId,
    siteName: site.siteName,
    siteUrl: websiteUrl || undefined,
    blogSlug: siteSlug,
    logoUrl,
  });

  const recentPosts = posts.slice(0, 5).map((p) => ({
    slug: String(p.slug),
    title: String(p.title),
    published_at: String(p.published_at),
  }));

  return (
    <BlogShell
      siteName={site.siteName}
      description={aboutText}
      navLinks={navLinks}
      theme={theme}
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

      {/* Article listing */}
      {posts.length === 0 ? (
        <p style={{ padding: "48px 0", textAlign: "center", color: "var(--bs-muted)" }}>
          No posts published yet.
        </p>
      ) : (
        <div>
          {posts.map((post) => {
            const ogImage = post.og_image_url ? String(post.og_image_url) : null;
            const excerpt = post.excerpt ? String(post.excerpt) : null;
            const publishedAt = post.published_at ? String(post.published_at) : null;
            const pillar = post.content_pillar ? String(post.content_pillar) : null;

            return (
              <article
                key={String(post.id)}
                style={{ borderBottom: "1px solid var(--bs-border)", padding: "24px 0" }}
              >
                <Link
                  href={`/blog/${siteSlug}/${String(post.slug)}`}
                  style={{ textDecoration: "none", color: "inherit" }}
                >
                  {ogImage && (
                    <img
                      src={ogImage}
                      alt={String(post.title)}
                      style={{
                        width: "100%",
                        height: 200,
                        objectFit: "cover",
                        borderRadius: "var(--bs-radius)",
                        marginBottom: 12,
                      }}
                    />
                  )}
                  <h2 style={{
                    fontFamily: "var(--bs-heading-font)",
                    fontSize: 20,
                    fontWeight: 600,
                    marginTop: 0,
                    marginBottom: 6,
                    color: "var(--bs-primary)",
                  }}>
                    {String(post.title)}
                  </h2>
                  {excerpt && (
                    <p style={{ fontSize: 15, color: "var(--bs-muted)", marginBottom: 8 }}>
                      {excerpt}
                    </p>
                  )}
                </Link>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                  {publishedAt && (
                    <time style={{ color: "var(--bs-muted)" }}>
                      {new Date(publishedAt).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </time>
                  )}
                  {pillar && (
                    <span style={{ color: "var(--bs-accent)" }}>
                      · {pillar}
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </BlogShell>
  );
}
