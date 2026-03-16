import type { PageType, SiteConfig, SeoAnalysis } from "../types";
import { generateLocalBusinessSchema } from "./local-business";
import { generateProductSchema } from "./product";
import { generateCollectionSchema } from "./collection";
import { generateArticleSchema } from "./article";
import { generateOrganizationSchema } from "./organization";

export {
  generateLocalBusinessSchema,
  generateProductSchema,
  generateCollectionSchema,
  generateArticleSchema,
  generateOrganizationSchema,
};

/**
 * Generate appropriate JSON-LD schema for a page based on its type.
 * Only generates schema types not already present on the page.
 */
export function generateSchemaForPage(
  pageType: PageType,
  analysis: SeoAnalysis,
  siteConfig: SiteConfig
): Record<string, unknown>[] {
  const existingTypes = new Set(
    analysis.existing.jsonLdTypes.map((t) => t.toLowerCase())
  );

  let candidates: Record<string, unknown>[] = [];

  switch (pageType) {
    case "homepage":
      candidates = generateOrganizationSchema(siteConfig);
      break;

    case "service":
      candidates = generateLocalBusinessSchema(siteConfig);
      break;

    case "product":
      // Product schema needs page-specific data we may not have.
      // Generate a minimal placeholder from what we can extract.
      candidates = generateProductSchema({
        name: analysis.existing.metaTitle || analysis.existing.ogTitle || "",
        description:
          analysis.existing.metaDescription ||
          analysis.existing.ogDescription ||
          undefined,
        image: analysis.existing.ogImage || undefined,
        url: analysis.url,
      });
      break;

    case "collection":
      candidates = generateCollectionSchema({
        name: analysis.existing.metaTitle || analysis.existing.ogTitle || "",
        description:
          analysis.existing.metaDescription ||
          analysis.existing.ogDescription ||
          undefined,
        url: analysis.url,
      });
      break;

    case "blog":
      candidates = generateArticleSchema({
        headline:
          analysis.existing.metaTitle || analysis.existing.ogTitle || "",
        description:
          analysis.existing.metaDescription ||
          analysis.existing.ogDescription ||
          undefined,
        image: analysis.existing.ogImage || undefined,
        url: analysis.url,
        publisherName: siteConfig.name,
        publisherLogo: siteConfig.logo,
      });
      break;

    case "unknown":
      // For unknown pages, generate Organization if not present
      candidates = generateOrganizationSchema(siteConfig);
      break;
  }

  // Filter out schema types already present on the page
  return candidates.filter((schema) => {
    const type = String(schema["@type"] || "").toLowerCase();
    return !existingTypes.has(type);
  });
}
