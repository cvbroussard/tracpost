/**
 * Article schema.org JSON-LD generator.
 *
 * Ported from v1 (`buildArticleSchema` in blog-generator.ts). Builds
 * the structured-data blob that Google reads for rich-result eligibility.
 * Stored on the v2 row's metadata or a dedicated schema_jsonld field
 * (depends on the v2 schema; current blog_posts_v2 uses metadata JSONB).
 *
 * Pool-agnostic — works for blog articles, project pages, and service
 * pages. Caller passes the right context (heroUrl, datePublished).
 */

export interface ArticleSchemaInput {
  title: string;
  body: string;
  excerpt: string | null;
  metaDescription: string | null;
  heroUrl: string | null;
  siteName: string;
  siteUrl: string;
  datePublished?: string; // ISO; defaults to now
}

export function buildArticleSchema(input: ArticleSchemaInput): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: input.title,
    description: input.metaDescription || input.excerpt || "",
    image: input.heroUrl || undefined,
    author: {
      "@type": "Organization",
      name: input.siteName,
      url: input.siteUrl,
    },
    publisher: {
      "@type": "Organization",
      name: input.siteName,
    },
    datePublished: input.datePublished || new Date().toISOString(),
    wordCount: input.body.split(/\s+/).length,
  };
}
