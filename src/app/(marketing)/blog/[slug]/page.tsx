import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { sql } from "@/lib/db";
import { markdownToHtml } from "@/lib/blog/markdown";
import Link from "next/link";

export const revalidate = 3600;

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const [post] = await sql`
    SELECT bp.title, bp.excerpt, bp.og_image_url
    FROM blog_posts bp
    JOIN sites s ON s.id = bp.site_id
    WHERE bp.slug = ${slug} AND s.blog_slug = 'tracpost' AND bp.status = 'published'
  `;
  if (!post) return {};
  return {
    title: `${post.title} — TracPost Blog`,
    description: post.excerpt ? String(post.excerpt).slice(0, 160) : undefined,
    openGraph: {
      title: String(post.title),
      description: post.excerpt ? String(post.excerpt).slice(0, 160) : undefined,
      images: post.og_image_url ? [String(post.og_image_url)] : undefined,
    },
    alternates: {
      canonical: `https://tracpost.com/blog/${slug}`,
    },
  };
}

export default async function MarketingBlogArticle({ params }: Props) {
  const { slug } = await params;

  const [post] = await sql`
    SELECT bp.title, bp.body, bp.excerpt, bp.og_image_url, bp.published_at,
           bp.content_type, bp.content_pillar
    FROM blog_posts bp
    JOIN sites s ON s.id = bp.site_id
    WHERE bp.slug = ${slug} AND s.blog_slug = 'tracpost' AND bp.status = 'published'
  `;
  if (!post) notFound();

  const body = String(post.body || "");
  const category = (post.content_type as string) || (post.content_pillar as string) || "Insight";
  const date = post.published_at
    ? new Date(String(post.published_at)).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: String(post.title),
        description: post.excerpt ? String(post.excerpt) : undefined,
        image: post.og_image_url ? String(post.og_image_url) : undefined,
        datePublished: post.published_at
          ? new Date(String(post.published_at)).toISOString()
          : undefined,
        author: {
          "@type": "Organization",
          name: "TracPost",
          url: "https://tracpost.com",
        },
        publisher: {
          "@type": "Organization",
          name: "TracPost",
          url: "https://tracpost.com",
          logo: {
            "@type": "ImageObject",
            url: "https://tracpost.com/icon.png",
          },
        },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: "https://tracpost.com" },
          { "@type": "ListItem", position: 2, name: "Blog", item: "https://tracpost.com/blog" },
          { "@type": "ListItem", position: 3, name: String(post.title) },
        ],
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <article className="mp-article">
        <div className="mp-container mp-article-container">
          <div className="mp-article-header">
            <Link href="/blog" className="mp-article-back">← Blog</Link>
            <span className="mp-article-cat">{category}</span>
            <h1 className="mp-article-title">{String(post.title)}</h1>
            {date && <p className="mp-article-date">{date}</p>}
          </div>

          {post.og_image_url && (
            <img
              src={String(post.og_image_url)}
              alt={String(post.title)}
              className="mp-article-hero-img"
            />
          )}

          <div
            className="mp-prose"
            dangerouslySetInnerHTML={{
              __html: markdownToHtml(body),
            }}
          />

          <div className="mp-article-footer">
            <Link href="/blog" className="mp-btn-outline">
              ← Back to blog
            </Link>
          </div>
        </div>
      </article>

      {/* CTA */}
      <section className="mp-section mp-section-alt">
        <div className="mp-container mp-text-center">
          <h2 className="mp-section-title">We take care of marketing. You take care of business.</h2>
          <p className="mp-section-subtitle" style={{ margin: "0 auto 24px" }}>
            Start publishing across 8 platforms in minutes.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <Link href="/pricing" className="mp-btn-primary mp-btn-lg">
              Start 7-day trial
            </Link>
            <Link href="/contact" className="mp-btn-outline mp-btn-lg">
              Talk to us
            </Link>
          </div>
        </div>
      </section>

      <style dangerouslySetInnerHTML={{ __html: articleStyles }} />
    </>
  );
}

const articleStyles = `
  .mp-article { padding: 48px 0 0; }
  .mp-article-container { max-width: 780px; }

  .mp-article-header { margin-bottom: 40px; }
  .mp-article-back {
    display: inline-block;
    font-size: 13px;
    color: #6b7280;
    text-decoration: none;
    margin-bottom: 24px;
  }
  .mp-article-back:hover { color: #1a1a1a; }
  .mp-article-cat {
    display: inline-block;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #6b7280;
    margin-bottom: 12px;
  }
  .mp-article-title {
    font-size: 40px;
    font-weight: 700;
    color: #1a1a1a;
    line-height: 1.15;
    letter-spacing: -0.02em;
    margin-bottom: 16px;
  }
  @media (max-width: 768px) { .mp-article-title { font-size: 28px; } }
  .mp-article-date { font-size: 14px; color: #9ca3af; }

  .mp-article-hero-img {
    width: 100%;
    border-radius: 10px;
    margin-bottom: 40px;
  }

  .mp-prose {
    font-size: 17px;
    color: #374151;
    line-height: 1.8;
  }
  .mp-prose p { margin-bottom: 1.4em; }
  .mp-prose h2 {
    font-size: 24px;
    font-weight: 700;
    color: #1a1a1a;
    margin: 2em 0 0.8em;
  }
  .mp-prose h3 {
    font-size: 20px;
    font-weight: 600;
    color: #1a1a1a;
    margin: 1.6em 0 0.6em;
  }
  .mp-prose a { color: #1a1a1a; text-decoration: underline; }
  .mp-prose a:hover { color: #6b7280; }
  .mp-prose img {
    border-radius: 8px;
    margin: 2em 0;
  }
  .mp-prose ul, .mp-prose ol {
    margin: 1em 0;
    padding-left: 1.5em;
  }
  .mp-prose li { margin-bottom: 0.5em; }
  .mp-prose blockquote {
    border-left: 3px solid #e5e7eb;
    padding-left: 20px;
    color: #6b7280;
    font-style: italic;
    margin: 1.4em 0;
  }
  .mp-prose code {
    font-size: 14px;
    background: #f3f4f6;
    padding: 2px 6px;
    border-radius: 4px;
  }
  .mp-prose pre {
    background: #1a1a1a;
    color: #e5e7eb;
    padding: 20px;
    border-radius: 8px;
    overflow-x: auto;
    margin: 1.4em 0;
  }
  .mp-prose pre code {
    background: none;
    padding: 0;
    color: inherit;
  }

  .mp-article-footer {
    margin-top: 56px;
    padding-top: 32px;
    border-top: 1px solid #e5e7eb;
  }
`;
