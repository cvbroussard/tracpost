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
    SELECT bp.title, bp.excerpt, bp.og_image_url, bp.metadata
    FROM blog_posts bp
    JOIN sites s ON s.id = bp.site_id
    WHERE bp.slug = ${slug} AND s.blog_slug = 'tracpost' AND bp.status = 'published'
  `;
  if (!post) return {};
  const noindex = (post.metadata as { noindex?: boolean } | null)?.noindex === true;
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
    robots: noindex ? { index: false, follow: true } : undefined,
  };
}

export default async function MarketingBlogArticle({ params }: Props) {
  const { slug } = await params;

  const [post] = await sql`
    SELECT bp.title, bp.body, bp.excerpt, bp.og_image_url, bp.published_at,
           bp.content_type, bp.content_pillar, bp.metadata
    FROM blog_posts bp
    JOIN sites s ON s.id = bp.site_id
    WHERE bp.slug = ${slug} AND s.blog_slug = 'tracpost' AND bp.status = 'published'
  `;
  if (!post) notFound();

  const body = String(post.body || "");

  // Series detection — pulls all published siblings ordered by index
  const seriesMeta = (post.metadata as { series?: { slug: string; name: string; index: number; total: number } } | null)?.series;
  type SeriesEntry = { slug: string; title: string; index: number };
  let seriesEntries: SeriesEntry[] = [];
  let nextInSeries: SeriesEntry | null = null;
  if (seriesMeta?.slug) {
    const siblings = await sql`
      SELECT bp.slug, bp.title, bp.metadata
      FROM blog_posts bp
      JOIN sites s ON s.id = bp.site_id
      WHERE s.blog_slug = 'tracpost'
        AND bp.status = 'published'
        AND bp.metadata->'series'->>'slug' = ${seriesMeta.slug}
    `;
    seriesEntries = siblings
      .map((s) => ({
        slug: s.slug as string,
        title: s.title as string,
        index: ((s.metadata as { series?: { index: number } })?.series?.index ?? 999),
      }))
      .sort((a, b) => a.index - b.index);
    nextInSeries = seriesEntries.find((e) => e.index === seriesMeta.index + 1) || null;
  }
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

          {post.og_image_url ? (
            <img
              src={String(post.og_image_url)}
              alt={String(post.title)}
              className="mp-article-hero-img"
              fetchPriority="high"
            />
          ) : (
            <div className="mp-article-hero-placeholder" aria-hidden="true">
              <span className="mp-article-hero-placeholder-eyebrow">Hero placeholder</span>
              <span className="mp-article-hero-placeholder-title">{String(post.title)}</span>
            </div>
          )}

          {/* Series banner — top */}
          {seriesMeta && seriesEntries.length > 1 && (
            <aside className="mp-series-banner" aria-label="Article series">
              <div className="mp-series-banner-head">
                <span className="mp-series-eyebrow">A {seriesEntries.length}-part series</span>
                <h2 className="mp-series-name">{seriesMeta.name}</h2>
              </div>
              <ol className="mp-series-list">
                {seriesEntries.map((e) => (
                  <li key={e.slug} className={e.slug === slug ? "mp-series-item-current" : "mp-series-item"}>
                    {e.slug === slug ? (
                      <span><strong>Part {e.index}</strong> · {e.title}</span>
                    ) : (
                      <Link href={`/blog/${e.slug}`}>
                        <span className="mp-series-num">Part {e.index}</span>
                        <span className="mp-series-title">{e.title}</span>
                      </Link>
                    )}
                  </li>
                ))}
              </ol>
            </aside>
          )}

          <div
            className="mp-prose"
            dangerouslySetInnerHTML={{
              __html: markdownToHtml(body),
            }}
          />

          {/* Series next-link — bottom */}
          {nextInSeries && (
            <Link href={`/blog/${nextInSeries.slug}`} className="mp-series-next">
              <span className="mp-series-next-eyebrow">Next in this series →</span>
              <span className="mp-series-next-title">Part {nextInSeries.index}: {nextInSeries.title}</span>
            </Link>
          )}

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
    color: #4b5563;
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
    color: #4b5563;
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
  .mp-article-date { font-size: 14px; color: #4b5563; }

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
  .mp-prose h4 {
    font-size: 17px;
    font-weight: 600;
    color: #1a1a1a;
    margin: 1.4em 0 0.5em;
  }
  .mp-prose h5 {
    font-size: 15px;
    font-weight: 600;
    color: #1a1a1a;
    margin: 1.2em 0 0.4em;
  }
  .mp-prose a { color: #1a1a1a; text-decoration: underline; }
  .mp-prose a:hover { color: #4b5563; }
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
    color: #4b5563;
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

  /* Hero placeholder for articles without og_image_url */
  .mp-article-hero-placeholder {
    width: 100%;
    aspect-ratio: 16 / 9;
    margin: 0 0 40px;
    background: linear-gradient(135deg, #1a1a1a 0%, #4b5563 100%);
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 24px;
    text-align: center;
    box-sizing: border-box;
  }
  .mp-article-hero-placeholder-eyebrow {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: rgba(255,255,255,0.45);
    margin-bottom: 12px;
    font-weight: 600;
  }
  .mp-article-hero-placeholder-title {
    font-size: 28px;
    font-weight: 700;
    color: rgba(255,255,255,0.92);
    line-height: 1.2;
    max-width: 600px;
  }

  /* Series banner — top */
  .mp-series-banner {
    margin: 0 0 48px;
    padding: 24px 28px;
    background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%);
    border: 1px solid #e5e7eb;
    border-left: 3px solid #1a1a1a;
    border-radius: 8px;
  }
  .mp-series-banner-head {
    margin-bottom: 16px;
    padding-bottom: 14px;
    border-bottom: 1px solid #e5e7eb;
  }
  .mp-series-eyebrow {
    display: block;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #6b7280;
    font-weight: 600;
    margin-bottom: 4px;
  }
  .mp-series-name {
    font-size: 18px;
    font-weight: 700;
    color: #1a1a1a;
    margin: 0;
    line-height: 1.3;
  }
  .mp-series-list {
    list-style: none;
    margin: 0;
    padding: 0;
    counter-reset: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .mp-series-list li {
    font-size: 14px;
    line-height: 1.5;
  }
  .mp-series-item-current {
    color: #1a1a1a;
    padding: 6px 10px;
    background: rgba(0, 0, 0, 0.04);
    border-radius: 4px;
  }
  .mp-series-item-current strong { font-weight: 700; }
  .mp-series-item a {
    display: flex;
    align-items: baseline;
    gap: 10px;
    padding: 6px 10px;
    color: #4b5563;
    text-decoration: none;
    border-radius: 4px;
    transition: color 0.15s, background 0.15s;
  }
  .mp-series-item a:hover {
    color: #1a1a1a;
    background: rgba(0, 0, 0, 0.03);
  }
  .mp-series-num {
    font-size: 11px;
    font-weight: 700;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    flex-shrink: 0;
    width: 56px;
  }
  .mp-series-title {
    flex: 1;
  }

  /* Series next-link — bottom */
  .mp-series-next {
    display: block;
    margin-top: 56px;
    padding: 24px 28px;
    background: #1a1a1a;
    color: #fff;
    border-radius: 8px;
    text-decoration: none;
    transition: background 0.15s;
  }
  .mp-series-next:hover {
    background: #2a2a2a;
  }
  .mp-series-next-eyebrow {
    display: block;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #9ca3af;
    font-weight: 600;
    margin-bottom: 6px;
  }
  .mp-series-next-title {
    display: block;
    font-size: 18px;
    font-weight: 600;
    line-height: 1.3;
  }
`;
