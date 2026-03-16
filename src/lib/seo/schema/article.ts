/**
 * Generate Article structured data for blog posts.
 */
export interface ArticleData {
  headline: string;
  description?: string;
  url: string;
  image?: string;
  datePublished?: string;
  dateModified?: string;
  authorName?: string;
  publisherName: string;
  publisherLogo?: string;
}

export function generateArticleSchema(
  data: ArticleData
): Record<string, unknown>[] {
  const article: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: data.headline,
    url: data.url,
    publisher: {
      "@type": "Organization",
      name: data.publisherName,
      ...(data.publisherLogo && {
        logo: { "@type": "ImageObject", url: data.publisherLogo },
      }),
    },
  };

  if (data.description) article.description = data.description;
  if (data.image) article.image = data.image;
  if (data.datePublished) article.datePublished = data.datePublished;
  if (data.dateModified) article.dateModified = data.dateModified;
  if (data.authorName) {
    article.author = { "@type": "Person", name: data.authorName };
  }

  return [article];
}
